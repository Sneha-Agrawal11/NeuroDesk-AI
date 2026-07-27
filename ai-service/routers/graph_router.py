from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from graph.extractor import GraphExtractor

router = APIRouter(prefix="/internal/graph", tags=["graph"])

class ExtractRequest(BaseModel):
    file_name: str
    content: str
    workspace_files: List[Dict[str, str]]

@router.post("/extract")
async def extract_graph_data(req: ExtractRequest):
    try:
        # Extract Technologies/Skills (Nodes)
        tech_nodes = GraphExtractor.extract_technologies(req.content)
        
        # Extract File-to-File relationships (Edges)
        relationships = GraphExtractor.extract_relationships(
            req.file_name, 
            req.content, 
            req.workspace_files
        )
        
        return {
            "success": True, 
            "technologies": tech_nodes,
            "relationships": relationships
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
