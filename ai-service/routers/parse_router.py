from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from parsers.pdf_parser import PDFParser
from parsers.base import FileParser

router = APIRouter(prefix="/internal/parse", tags=["parsing"])

class ParseRequest(BaseModel):
    file_path: str
    file_type: str  # e.g. "pdf", "docx", "txt"

class ParseResponse(BaseModel):
    success: bool
    text: str
    chunks: list[str]

@router.post("/")
async def parse_file(req: ParseRequest) -> ParseResponse:
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        from parsers.multimodal_parser import MultimodalParser
        parser = MultimodalParser()
        text = parser.parse(req.file_path)
        chunks = parser.chunk_text(text)
            
        if not text.strip():
            raise ValueError("No extractable text was found in this file")
        return ParseResponse(success=True, text=text, chunks=chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
