import os
from openai import AsyncOpenAI
from typing import AsyncGenerator, Dict, Any, List, Optional
from providers.base import AIProvider

class OpenAIProvider(AIProvider):
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.client = AsyncOpenAI(api_key=self.api_key) if self.api_key else None
        self.default_model = os.getenv("AI_DEFAULT_MODEL", "gpt-4o-mini")

    async def chat(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> AsyncGenerator[str, None]:
        if not self.client:
            yield "OpenAI API key not configured."
            return

        model_name = options.get("model", self.default_model) if options else self.default_model
        
        response = await self.client.chat.completions.create(
            model=model_name,
            messages=messages,
            stream=True,
            temperature=options.get("temperature", 0.7) if options else 0.7
        )
        
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def summarize(self, text: str, max_length: int = 500) -> str:
        if not self.client:
            return ""
            
        response = await self.client.chat.completions.create(
            model=self.default_model,
            messages=[
                {"role": "system", "content": f"Summarize the following text in under {max_length} characters."},
                {"role": "user", "content": text}
            ],
            temperature=0.3
        )
        return response.choices[0].message.content or ""

    async def generate(self, prompt: str, options: Optional[Dict[str, Any]] = None) -> str:
        if not self.client:
            return ""
            
        model_name = options.get("model", self.default_model) if options else self.default_model
        response = await self.client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=options.get("temperature", 0.7) if options else 0.7
        )
        return response.choices[0].message.content or ""

    def get_name(self) -> str:
        return "openai"

    def is_available(self) -> bool:
        return bool(self.api_key)
