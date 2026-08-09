from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from providers import get_ai_provider
from orchestrator import ai_orchestrator
from memory.context_builder import ContextBuilder
 
router = APIRouter(prefix="/internal/chat", tags=["chat"])
 
class ChatMessage(BaseModel):
    role: str
    content: str
 
class ChatRequest(BaseModel):
    query: str
    history: List[ChatMessage] = []
    retrieved_chunks: List[Dict[str, Any]] = []
    workspace_context: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
 
@router.post("/stream")
async def chat_stream(req: ChatRequest):
    try:
        # Build prompt using context builder
        history_dicts = [msg.model_dump() for msg in req.history]
 
        messages = ContextBuilder.build_chat_messages(
            query=req.query,
            history=history_dicts,
            retrieved_chunks=req.retrieved_chunks,
            workspace_context=req.workspace_context
        )
 
        options = {"model": req.model} if req.model else None
 
        async def event_generator():
            # If the caller explicitly pinned a provider (advanced/debug use),
            # honor it without fallback. Otherwise use the orchestrator so
            # chat automatically survives a Gemini outage/quota exhaustion.
            if req.provider:
                provider = get_ai_provider(req.provider)
                try:
                    async for chunk in provider.chat(messages, options):
                        yield f"data: {chunk}\n\n"
                    yield "data: [DONE]\n\n"
                except Exception as e:
                    yield f"data: [ERROR] {str(e)}\n\n"
                return
 
            async for chunk in ai_orchestrator.chat(messages, task="CHAT", options=options):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
 
        return StreamingResponse(event_generator(), media_type="text/event-stream")
 
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    