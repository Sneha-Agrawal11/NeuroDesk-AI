from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from embedding.service import get_embedding_service, EmbeddingService

router = APIRouter(prefix="/internal/embed", tags=["embedding"])

class ChunkModel(BaseModel):
    chunk_index: int
    content: str
    category: Optional[str] = "unknown"
    project_id: Optional[str] = ""
    filename: Optional[str] = ""

class StoreChunksRequest(BaseModel):
    file_id: str
    chunks: List[ChunkModel]

class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    filters: Optional[Dict[str, Any]] = None

@router.post("/batch")
async def store_chunks(req: StoreChunksRequest, service: EmbeddingService = Depends(get_embedding_service)):
    try:
        chunks_dict = [chunk.model_dump() for chunk in req.chunks]
        ids = service.store_chunks(req.file_id, chunks_dict)
        return {"success": True, "stored_ids": ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search")
async def semantic_search(req: SearchRequest, service: EmbeddingService = Depends(get_embedding_service)):
    try:
        results = service.search(req.query, req.limit, req.filters)
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
