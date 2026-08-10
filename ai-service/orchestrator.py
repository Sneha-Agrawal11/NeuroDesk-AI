"""
AI Orchestrator - single entry point for every AI call in NeuroDesk.
 
Nothing in the rest of the app should import a provider directly anymore.
Instead: `from orchestrator import ai_orchestrator` and call
`ai_orchestrator.generate(...)` or `ai_orchestrator.chat(...)`.
 
Responsibilities:
- Try providers in priority order (configurable via AI_PROVIDER_PRIORITY).
- Classify failures as recoverable (fall back to next provider) vs
  non-recoverable (our request is bad - don't waste other providers' quota).
- Track a per-provider cooldown so a just-rate-limited provider isn't hit
  again immediately; it's automatically retried once the cooldown expires.
- Return a unified response shape regardless of which provider answered.
- Never raise all the way up to a 500 - always return a controlled result.
"""
import os
import re
import time
import logging
from typing import AsyncGenerator, Dict, Any, List, Optional
 
from providers import get_ai_provider, factory as provider_factory
 
logger = logging.getLogger("ai_orchestrator")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
    logger.propagate = False
 
# Patterns that indicate a TRANSIENT provider-side problem worth falling back
# for: rate limits, quota, temporary unavailability, timeouts, connection
# issues. Deliberately does NOT match things like "invalid request" / "bad
# api key" / "unsupported" - those are OUR problem, not the provider's, and
# retrying against a different provider won't fix them.
RECOVERABLE_PATTERNS = re.compile(
    r"429|rate.?limit|resource_exhausted|quota|503|unavailable|timeout|"
    r"timed out|connection|econnreset|econnrefused|getaddrinfo|5\d\d\b",
    re.IGNORECASE,
)
 
# How long (seconds) a provider sits in cooldown after a recoverable failure,
# before the orchestrator is willing to try it again. Deliberately short -
# this is a "don't hammer it for a few seconds" guard, not a long ban;
# providers should recover automatically once their limit window rolls over.
DEFAULT_COOLDOWN_SECONDS = 60
 
# Which task types are allowed to use which providers. Vision/image tasks
# currently only run reliably on Gemini in this codebase - Groq/Ollama vision
# support depends on specific models the user may not have pulled/configured,
# so we don't silently send an image task to a text-only model and call that
# a "provider outage".
TASK_CAPABILITIES = {
    "IMAGE_ANALYSIS": {"gemini"},
    "RESUME_VISION_FORMATTING": {"gemini"},
}
 
 
class ProviderHealth:
    """In-memory cooldown tracker. Resets on process restart - that's fine,
    it's meant to protect against bursts within a single running session,
    not to be a durable ledger."""
 
    def __init__(self):
        self._cooldown_until: Dict[str, float] = {}
 
    def mark_cooldown(self, provider_name: str, seconds: float = DEFAULT_COOLDOWN_SECONDS):
        self._cooldown_until[provider_name] = time.time() + seconds
        logger.warning(f"[AI] Provider {provider_name} entering cooldown for {seconds:.0f}s")
 
    def is_available(self, provider_name: str) -> bool:
        until = self._cooldown_until.get(provider_name)
        if until is None:
            return True
        if time.time() >= until:
            del self._cooldown_until[provider_name]
            logger.info(f"[AI] Provider {provider_name} cooldown expired, eligible again")
            return True
        return False
 
 
def _is_recoverable(error: Exception) -> bool:
    return bool(RECOVERABLE_PATTERNS.search(str(error)))
 
 
def _extract_retry_after(error: Exception) -> Optional[float]:
    """Best-effort parse of a retry-after hint from a provider error message.
    Real providers use different phrasings:
      - Groq: "Please try again in 90ms" / "try again in 12.4s"
      - Gemini: "retryDelay': '50s'"
      - Generic: "retry-after: 30"
    Blindly cooling down for a flat 60s when a provider explicitly says
    "90ms" wastes most of a minute of that provider's availability for no
    reason - especially costly when it's the ONLY other provider configured.
    """
    text = str(error)
 
    match = re.search(r"(?:try\s+again\s+in|retry\s+in)\s+([\d.]+)\s*ms", text, re.IGNORECASE)
    if match:
        return max(float(match.group(1)) / 1000.0, 0.5)
 
    match = re.search(r"(?:try\s+again\s+in|retry\s+in)\s+([\d.]+)\s*s\b", text, re.IGNORECASE)
    if match:
        return float(match.group(1))
 
    match = re.search(r"retry.?delay['\"]?\s*[:=]\s*['\"]?([\d.]+)\s*s", text, re.IGNORECASE)
    if match:
        return float(match.group(1))
 
    match = re.search(r"retry.?after[\"'\s:]+(\d+(?:\.\d+)?)", text, re.IGNORECASE)
    if match:
        return float(match.group(1))
 
    return None
 
 
class AIOrchestrator:
    def __init__(self):
        self.health = ProviderHealth()
 
    def _priority_order(self) -> List[str]:
        raw = os.getenv("AI_PROVIDER_PRIORITY", "gemini,groq,ollama")
        return [p.strip() for p in raw.split(",") if p.strip()]
 
    def _eligible_providers(self, task: Optional[str] = None):
        allowed = TASK_CAPABILITIES.get(task) if task else None
        for name in self._priority_order():
            if allowed is not None and name not in allowed:
                continue
            if not self.health.is_available(name):
                logger.info(f"[AI] Skipping {name} (in cooldown)")
                continue
            try:
                provider = get_ai_provider(name)
            except Exception:
                continue
            # get_ai_provider() can silently fall back to 'local' if the
            # requested name isn't configured - detect that and skip instead
            # of quietly treating 'local' as if it were the real provider.
            if provider.get_name() != name:
                continue
            if not provider.is_available():
                continue
            yield name, provider
 
    async def generate(
        self,
        task: str,
        prompt: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Unified single-shot generation with automatic fallback.
 
        Returns: {success, content, provider, model, fallbackUsed, error?}
        """
        attempted: List[str] = []
        last_error: Optional[str] = None
 
        for name, provider in self._eligible_providers(task):
            attempted.append(name)
            logger.info(f"[AI] Task: {task} | Provider: {name} | Attempting...")
            try:
                content = await provider.generate(prompt, options)
                if content and content.strip():
                    logger.info(f"[AI] Task: {task} | Provider: {name} | Result: SUCCESS")
                    return {
                        "success": True,
                        "content": content,
                        "provider": name,
                        "model": (options or {}).get("model", "default"),
                        "cached": False,
                        "fallbackUsed": len(attempted) > 1,
                    }
                last_error = "empty response"
            except Exception as e:
                last_error = str(e)
                if _is_recoverable(e):
                    logger.warning(f"[AI] Task: {task} | Provider: {name} | Result: RECOVERABLE_ERROR ({last_error[:200]}) | Falling back...")
                    retry_after = _extract_retry_after(e)
                    self.health.mark_cooldown(name, retry_after or DEFAULT_COOLDOWN_SECONDS)
                    continue
                else:
                    # Non-recoverable (our request is malformed, bad auth
                    # config, unsupported task, etc.) - don't waste every
                    # other provider's quota retrying the same bad request.
                    logger.error(f"[AI] Task: {task} | Provider: {name} | Result: NON_RECOVERABLE_ERROR ({last_error[:200]})")
                    return {
                        "success": False,
                        "content": None,
                        "provider": name,
                        "error": last_error,
                        "fallbackUsed": len(attempted) > 1,
                    }
 
        logger.error(f"[AI] Task: {task} | All providers exhausted: {attempted} | Last error: {last_error}")
        return {
            "success": False,
            "content": None,
            "provider": None,
            "error": last_error or "No AI provider is currently available.",
            "fallbackUsed": len(attempted) > 1,
            "providersAttempted": attempted,
        }
 
    async def chat(
        self,
        messages: List[Dict[str, str]],
        task: str = "CHAT",
        options: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[str, None]:
        """Unified streaming chat with automatic fallback. Fallback only
        happens if a provider fails BEFORE it has streamed any content -
        once tokens have reached the client we can't cleanly restart with a
        different provider, so we surface a short notice instead."""
        attempted: List[str] = []
 
        for name, provider in self._eligible_providers(task):
            attempted.append(name)
            logger.info(f"[AI] Task: {task} | Provider: {name} | Attempting stream...")
            yielded_any = False
            try:
                async for chunk in provider.chat(messages, options):
                    yielded_any = True
                    yield chunk
                logger.info(f"[AI] Task: {task} | Provider: {name} | Result: SUCCESS")
                return
            except Exception as e:
                if yielded_any:
                    logger.error(f"[AI] Task: {task} | Provider: {name} | Stream interrupted mid-response: {e}")
                    yield "\n\n_[Connection interrupted - please try asking again]_"
                    return
                if _is_recoverable(e):
                    logger.warning(f"[AI] Task: {task} | Provider: {name} | Result: RECOVERABLE_ERROR | Falling back...")
                    retry_after = _extract_retry_after(e)
                    self.health.mark_cooldown(name, retry_after or DEFAULT_COOLDOWN_SECONDS)
                    continue
                else:
                    logger.error(f"[AI] Task: {task} | Provider: {name} | Result: NON_RECOVERABLE_ERROR: {e}")
                    yield "AI analysis is temporarily unavailable. Your document is safe and indexed. Please try again shortly."
                    return
 
        logger.error(f"[AI] Task: {task} | All providers exhausted: {attempted}")
        yield "AI analysis is temporarily unavailable right now (all AI providers are busy or not configured). Your document is safe and indexed - please try again shortly."
 
 
# Singleton - import this everywhere instead of talking to providers directly.
ai_orchestrator = AIOrchestrator()
 