from typing import AsyncGenerator, Dict, Any, List, Optional

from providers.base import AIProvider


class LocalProvider(AIProvider):
    def _build_response(self, messages: List[Dict[str, str]]) -> str:
        # This provider intentionally never fabricates an answer. It exists only
        # to make an unconfigured desktop installation fail honestly.
        return 'No AI provider is configured. Configure Gemini, OpenAI, or Ollama to generate a grounded workspace answer.'

    async def chat(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> AsyncGenerator[str, None]:
        response = self._build_response(messages)
        for chunk in response.split(' '):
            yield chunk + ' '

    async def summarize(self, text: str, max_length: int = 500) -> str:
        summary = text.strip().replace('\n', ' ')
        return summary[:max_length]

    async def generate(self, prompt: str, options: Optional[Dict[str, Any]] = None) -> str:
        return prompt[:1000]

    def get_name(self) -> str:
        return 'local'

    def is_available(self) -> bool:
        return True
