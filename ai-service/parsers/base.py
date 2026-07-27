from abc import ABC, abstractmethod
from typing import List, Dict

class FileParser(ABC):
    @abstractmethod
    def parse(self, file_path: str) -> str:
        """Extract all text from the file."""
        pass
        
    def chunk_text(self, text: str, max_tokens: int = 400, overlap: int = 50) -> List[str]:
        """
        Simple word-based chunking.
        In a production environment, this should use a proper tokenizer (e.g. tiktoken).
        """
        words = text.split()
        chunks = []
        i = 0
        while i < len(words):
            chunk_words = words[i:i + max_tokens]
            chunks.append(" ".join(chunk_words))
            i += max_tokens - overlap
            
        return chunks
