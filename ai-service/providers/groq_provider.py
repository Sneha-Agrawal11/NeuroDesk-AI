import os
from openai import AsyncOpenAI
from typing import AsyncGenerator, Dict, Any, List, Optional
from providers.base import AIProvider
 
 
class GroqProvider(AIProvider):
    """Groq exposes an OpenAI-compatible API, so this reuses the same
    request/response shape as OpenAIProvider - just pointed at Groq's base
    URL with a Groq API key and Groq model names."""
 
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url="https://api.groq.com/openai/v1",
        ) if self.api_key else None
        # llama-3.3-70b-versatile is Groq's current flagship general-purpose
        # text model - fast and capable enough for document/resume analysis.
        self.default_model = os.getenv("GROQ_DEFAULT_MODEL", "llama-3.3-70b-versatile")
 
    async def chat(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> AsyncGenerator[str, None]:
        if not self.client:
            raise RuntimeError("Groq API key not configured")
 
        model_name = options.get("model", self.default_model) if options else self.default_model
        response = await self.client.chat.completions.create(
            model=model_name,
            messages=messages,
            stream=True,
            temperature=options.get("temperature", 0.7) if options else 0.7,
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
 
    async def summarize(self, text: str, max_length: int = 500) -> str:
        if not self.client:
            raise RuntimeError("Groq API key not configured")
 
        response = await self.client.chat.completions.create(
            model=self.default_model,
            messages=[
                {"role": "system", "content": f"Summarize the following text in under {max_length} characters."},
                {"role": "user", "content": text},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""
 
    async def generate(self, prompt: str, options: Optional[Dict[str, Any]] = None) -> str:
        if not self.client:
            raise RuntimeError("Groq API key not configured")
 
        model_name = options.get("model", self.default_model) if options else self.default_model
        kwargs: Dict[str, Any] = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": options.get("temperature", 0.7) if options else 0.7,
        }
        if options and options.get("max_output_tokens"):
            kwargs["max_tokens"] = options["max_output_tokens"]
 
        # Every current caller of generate() in this app expects pure JSON
        # back (the prompt itself says so). Llama-family models via Groq are
        # noticeably less reliable than Gemini at honoring a "return only
        # JSON" instruction in plain text - they'll sometimes add a stray
        # sentence or produce near-valid-but-broken JSON. Groq's JSON mode
        # forces the decoder to only emit syntactically valid JSON, which
        # fixes this at the source instead of hoping the prompt is obeyed.
        if options is None or options.get("expect_json", True):
            kwargs["response_format"] = {"type": "json_object"}
 
        try:
            response = await self.client.chat.completions.create(**kwargs)
        except Exception as e:
            # Some Groq models don't support response_format - retry once
            # without it rather than failing the whole request outright.
            if "response_format" in kwargs and "response_format" in str(e).lower():
                kwargs.pop("response_format")
                response = await self.client.chat.completions.create(**kwargs)
            else:
                raise
        return response.choices[0].message.content or ""
 
    def get_name(self) -> str:
        return "groq"
 
    def is_available(self) -> bool:
        return bool(self.api_key)
 