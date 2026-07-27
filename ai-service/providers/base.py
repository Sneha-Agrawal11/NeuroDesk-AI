from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Any, List, Optional

class AIProvider(ABC):
    @abstractmethod
    async def chat(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> AsyncGenerator[str, None]:
        """Stream a chat completion."""
        pass

    @abstractmethod
    async def summarize(self, text: str, max_length: int = 500) -> str:
        """Generate a summary of the provided text."""
        pass

    @abstractmethod
    async def generate(self, prompt: str, options: Optional[Dict[str, Any]] = None) -> str:
        """Generate a single text completion."""
        pass

    @abstractmethod
    def get_name(self) -> str:
        """Get the provider name."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the provider is currently available."""
        pass
