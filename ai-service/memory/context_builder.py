from typing import List, Dict, Any

class ContextBuilder:
    @staticmethod
    def build_system_prompt(workspace_context: Dict[str, Any] = None) -> str:
        """Construct the dynamic system prompt based on user settings and context."""
        
        base_prompt = (
            "You are NeuroDesk AI, a deeply integrated personal knowledge assistant. "
            "Your goal is to help the user understand, navigate, and utilize their personal files and projects. "
            "You will be provided with context from the user's workspace. "
            "CRITICAL RULES:\n"
            "1. NEVER use generic RAG phrases like 'Based on the provided context...' or 'According to the documents...'. Answer naturally as if you simply know the information.\n"
            "2. NEVER expose UUIDs, chunk IDs, or embedding IDs to the user.\n"
            "3. If you need to cite a source, use human-readable formats like 'Source: Resume.pdf' or 'Source: SmartFarmer Project' at the end of your response or naturally in the text.\n"
            "4. If the answer is not in your context, use your general knowledge but clarify naturally that it's not from the user's files.\n\n"
            "SPECIAL KNOWLEDGE PROFILES:\n"
            "- RESUMES: If the user asks about their resume, automatically synthesize and provide: Name, Education, Skills, Projects, Experience, Technologies, Certifications, Achievements, ATS Score, Missing Skills, Strengths, Weaknesses, Interview Questions, and Resume Improvements.\n"
            "- PROJECTS/CODE: If the user asks about a project or source code, automatically synthesize and provide: Project Summary, Architecture, Folder Structure, Tech Stack, Dependencies, Features, Database, API Flow, Missing Modules, Security Issues, Performance Suggestions, Resume Points, and Interview Explanation.\n"
            "- IMAGES: If asked about images, search the context for image OCR data to identify contents like shirts, screenshots, certificates, invoices, passport, logos, etc.\n"
        )
        
        if workspace_context:
            context_str = "\n\n### Current Workspace Knowledge ###\n"
            
            if workspace_context.get("recent_projects"):
                context_str += "Recent Projects: " + ", ".join(workspace_context["recent_projects"]) + "\n"
                
            if workspace_context.get("recent_files"):
                context_str += "Recent Files: " + ", ".join(workspace_context["recent_files"]) + "\n"
                
            base_prompt += context_str
            
        return base_prompt

    @staticmethod
    def format_chunks_as_context(chunks: List[Dict[str, Any]]) -> str:
        """Format retrieved file chunks into a readable string for the prompt."""
        if not chunks:
            return ""
            
        context_str = "\n\n### Reference Files ###\n"
        for idx, chunk in enumerate(chunks):
            # Extract metadata and content
            metadata = chunk.get("metadata", {})
            file_id = metadata.get("file_id", "Unknown")
            filename = metadata.get("filename", "Unknown File")
            content = chunk.get("content", "")
            
            # We append a human-readable citation marker so the LLM can reference it naturally
            context_str += f"\n--- Source: {filename} ---\n"
            context_str += f"{content}\n"
            
        return context_str

    @staticmethod
    def build_chat_messages(
        query: str, 
        history: List[Dict[str, str]], 
        retrieved_chunks: List[Dict[str, Any]],
        workspace_context: Dict[str, Any] = None
    ) -> List[Dict[str, str]]:
        """Construct the final message array for the LLM."""
        
        messages = []
        
        # 1. System Prompt
        system_content = ContextBuilder.build_system_prompt(workspace_context)
        messages.append({"role": "system", "content": system_content})
        
        # 2. Conversation History
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
            
        # 3. Context & Current Query
        context_block = ContextBuilder.format_chunks_as_context(retrieved_chunks)
        
        final_user_content = query
        if context_block:
            final_user_content = f"Answer the following query using the provided workspace knowledge.\n{context_block}\n\nQuery: {query}"
            
        messages.append({"role": "user", "content": final_user_content})
        
        return messages
