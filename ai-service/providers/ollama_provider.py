import os
import httpx
import json
from typing import AsyncGenerator, Dict, Any, List, Optional
from providers.base import AIProvider

class OllamaProvider(AIProvider):
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.default_model = os.getenv("OLLAMA_DEFAULT_MODEL", "llama3.1:8b")

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
            return ""

    def get_name(self) -> str:
        return "ollama"

    def is_available(self) -> bool:
        # In a real scenario, we might ping the Ollama server to check
        return True
