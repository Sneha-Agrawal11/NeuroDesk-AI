from providers.base import AIProvider
from providers.gemini_provider import GeminiProvider
from providers.openai_provider import OpenAIProvider
from providers.groq_provider import GroqProvider
from providers.ollama_provider import OllamaProvider
from providers.local_provider import LocalProvider
import os
 
class ProviderFactory:
    def __init__(self):
        # Always register every provider, regardless of whether it looks
        # available right now - availability (API key present, Ollama
        # reachable, etc.) can change after this process started, so it's
        # checked fresh per-request by the orchestrator via is_available(),
        # not baked in once here.
        self.providers = {
            'local': LocalProvider(),
            'gemini': GeminiProvider(),
            'openai': OpenAIProvider(),
            'groq': GroqProvider(),
            'ollama': OllamaProvider(),
        }
 
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
 