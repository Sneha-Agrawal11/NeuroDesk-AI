import os
import httpx
import json
from typing import AsyncGenerator, Dict, Any, List, Optional
from providers.base import AIProvider
 
class OllamaProvider(AIProvider):
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.default_model = os.getenv("OLLAMA_DEFAULT_MODEL", "llama3.1:8b")
        self._availability_cache = None
        self._availability_checked_at = 0.0
 
    async def chat(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> AsyncGenerator[str, None]:
        model_name = options.get("model", self.default_model) if options else self.default_model
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST", 
                f"{self.base_url}/api/chat", 
                json={
                    "model": model_name,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": options.get("temperature", 0.7) if options else 0.7
                    }
                },
                timeout=None
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                        except json.JSONDecodeError:
                            pass
 
    async def summarize(self, text: str, max_length: int = 500) -> str:
        prompt = f"Summarize the following text in under {max_length} characters:\n\n{text}"
        return await self.generate(prompt)
 
    async def generate(self, prompt: str, options: Optional[Dict[str, Any]] = None) -> str:
        model_name = options.get("model", self.default_model) if options else self.default_model
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": options.get("temperature", 0.7) if options else 0.7
                    }
                },
                timeout=60.0
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("response", "")
            raise RuntimeError(f"Ollama returned status {response.status_code}: {response.text[:200]}")
 
    def get_name(self) -> str:
        return "ollama"
 
    def is_available(self) -> bool:
        import time
        # Cache the check briefly - we don't want to add a network round
        # trip to every single provider-eligibility check, but we also
        # don't want to assume Ollama is running forever if it was stopped.
        now = time.time()
        if self._availability_cache is not None and (now - self._availability_checked_at) < 15:
            return self._availability_cache
        try:
            resp = httpx.get(f"{self.base_url}/api/tags", timeout=1.5)
            self._availability_cache = resp.status_code == 200
        except Exception:
            self._availability_cache = False
        self._availability_checked_at = now
        return self._availability_cache
 