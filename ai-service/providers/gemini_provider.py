import os
import traceback
from typing import AsyncGenerator, Dict, Any, List, Optional
from google import genai
from google.genai import types
from providers.base import AIProvider

class GeminiProvider(AIProvider):
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        print(f"GEMINI_API_KEY loaded at runtime: {bool(self.api_key)}")
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.default_model = os.getenv("AI_DEFAULT_MODEL", "gemini-2.0-flash")

    async def chat(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> AsyncGenerator[str, None]:
        model_name = options.get("model", self.default_model) if options else self.default_model
        print(f"Selected provider: Gemini, Model: {model_name}")
        
        if not self.client:
            yield "data: [ERROR] Gemini API key not configured\n\n"
            return
            
        history = []
        system_instruction = None

        for msg in messages[:-1]:
            if msg["role"] == "system":
                system_instruction = msg["content"]
            else:
                role = "model" if msg["role"] == "assistant" else "user"
                history.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))
            
        last_message = messages[-1]["content"]
        
        config_kwargs = {}
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
            
        config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None
        
        print(f"Gemini Request - Model: {model_name}")
        print(f"Gemini Request - History size: {len(history)}")
        print(f"Gemini Request - Config: {config}")
        print(f"Gemini Request - Last message: {last_message}")
        
        try:
            chat = self.client.aio.chats.create(model=model_name, history=history, config=config)
            response = await chat.send_message_stream(last_message)
            async for chunk in response:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            print("=== GEMINI EXCEPTION ===")
            print(f"FULL GEMINI EXCEPTION: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            print("========================")
            raise

    async def summarize(self, text: str, max_length: int = 500) -> str:
        prompt = f"Summarize the following text in under {max_length} characters:\n\n{text}"
        response = await self.client.aio.models.generate_content(
            model=self.default_model,
            contents=prompt
        )
        return response.text

    async def generate(self, prompt: str, options: Optional[Dict[str, Any]] = None) -> str:
        model_name = options.get("model", self.default_model) if options else self.default_model
        response = await self.client.aio.models.generate_content(
            model=model_name,
            contents=prompt
        )
        return response.text

    def get_name(self) -> str:
        return "gemini"

    def is_available(self) -> bool:
        return bool(self.api_key)

