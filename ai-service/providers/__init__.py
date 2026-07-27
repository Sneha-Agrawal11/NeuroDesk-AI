from providers.base import AIProvider
from providers.gemini_provider import GeminiProvider
from providers.openai_provider import OpenAIProvider
from providers.ollama_provider import OllamaProvider
from providers.local_provider import LocalProvider
import os

class ProviderFactory:
    def __init__(self):
        self.providers = {}
        self.providers['local'] = LocalProvider()
        
        # Initialize available providers
        gemini = GeminiProvider()
        if gemini.is_available():
            self.providers["gemini"] = gemini
            
        openai = OpenAIProvider()
        if openai.is_available():
            self.providers["openai"] = openai
            
        ollama = OllamaProvider()
        if ollama.is_available():
            self.providers["ollama"] = ollama

    def get_provider(self, name: str = None) -> AIProvider:
        if not name:
            name = os.getenv("AI_DEFAULT_PROVIDER", "gemini")
            print(f"No provider specified, using default: {name}")
            
        if name in self.providers:
            return self.providers[name]
            
        if 'local' in self.providers:
            return self.providers['local']

        # Fallback to the first available provider if requested one is missing
        if self.providers:
            return next(iter(self.providers.values()))
            
        raise ValueError("No AI providers available")

# Singleton instance
factory = ProviderFactory()

def get_ai_provider(provider_name: str = None) -> AIProvider:
    return factory.get_provider(provider_name)
