from typing import AsyncGenerator, Dict, Any, List, Optional

from providers.base import AIProvider


class LocalProvider(AIProvider):
    def _build_response(self, messages: List[Dict[str, str]]) -> str:
        if not messages:
            return 'I do not have enough context to answer.'

        user_message = messages[-1].get('content', '')
        lines = user_message.splitlines()
        query = user_message
        citations: List[str] = []
        references: List[str] = []

        for line in lines:
            stripped = line.strip()
            if stripped.startswith('--- [Citation:'):
                citations.append(stripped)
            if stripped.startswith('[Citation:'):
                citations.append(stripped)
            if stripped.startswith('Query: '):
                query = stripped[len('Query: '):]

        for msg in messages:
            content = msg.get('content', '')
            if '[Citation:' in content:
                for part in content.split('[Citation:'):
                    if ']' in part:
                        citation = part.split(']')[0].strip()
                        if citation and citation not in references:
                            references.append(citation)

        if citations:
            cited = ', '.join(citations[:3])
            return (
                f'Based on the retrieved workspace context, I can answer your question: "{query}". '
                f'The most relevant references are {cited}. '
                'If you want, I can also summarize the linked files or search for related documents.'
            )

        if references:
            cited = ', '.join(references[:3])
            return (
                f'I could not find rich context for "{query}", but I did see these references: {cited}. '
                'Upload or index more files to improve the answer quality.'
            )

        return (
            f'I do not yet have indexed workspace context for "{query}". '
            'Import a folder or upload files, then ask again for a grounded answer.'
        )

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