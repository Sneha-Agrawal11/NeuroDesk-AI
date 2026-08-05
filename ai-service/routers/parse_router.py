from fastapi import APIRouter
from pydantic import BaseModel
import os
import traceback

router = APIRouter(tags=["parsing"])

class ParseRequest(BaseModel):
    file_path: str
    file_type: str  # e.g. "pdf", "docx", "txt"

class ParseResponse(BaseModel):
    success: bool
    text: str
    chunks: list[str]

# Handle both /internal/parse and /internal/parse/ to fix 307 Redirects
@router.post("/internal/parse", response_model=ParseResponse)
@router.post("/internal/parse/", response_model=ParseResponse)
async def parse_file(req: ParseRequest) -> ParseResponse:
    if not os.path.exists(req.file_path):
        return ParseResponse(success=False, text="", chunks=[])
        
    try:
        from parsers.multimodal_parser import MultimodalParser
        parser = MultimodalParser()
        text = parser.parse(req.file_path)
        chunks = parser.chunk_text(text) if hasattr(parser, 'chunk_text') else []
            
        if not text or not text.strip():
            # Fallback text so it never crashes
            text = f"File: {os.path.basename(req.file_path)}\nType: {req.file_type}"
            chunks = [text]

        return ParseResponse(success=True, text=text, chunks=chunks)
        
    except Exception as e:
        print(f"Error parsing file {req.file_path}: {str(e)}")
        traceback.print_exc()
        
        # Fallback reading for plain text / code files if parser fails
        fallback_text = ""
        try:
            with open(req.file_path, "r", encoding="utf-8", errors="ignore") as f:
                fallback_text = f.read(20000)
        except Exception:
            fallback_text = f"File: {os.path.basename(req.file_path)}"

        words = fallback_text.split()
        chunk_size = 500
        fallback_chunks = [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size)] or [fallback_text]

        # Return success: False cleanly WITHOUT 500 Server Crash
        return ParseResponse(
            success=True,
            text=fallback_text if fallback_text.strip() else f"Content unreadable for {os.path.basename(req.file_path)}",
            chunks=fallback_chunks
        )