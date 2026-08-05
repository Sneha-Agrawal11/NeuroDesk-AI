import os
# Disable ChromaDB noisy telemetry warnings at the very start
os.environ["ANONYMIZED_TELEMETRY"] = "False"

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load environment variables
load_dotenv(dotenv_path="../.env")

app = FastAPI(
    title="NeuroDesk AI Service",
    description="Python FastAPI service for AI, ML, and NLP tasks",
    version="1.0.0"
)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to localhost:3000 / localhost:3001
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import Routers
from routers.embed_router import router as embed_router
from routers.parse_router import router as parse_router
from routers.chat_router import router as chat_router
from routers.graph_router import router as graph_router
from routers.ml_router import router as ml_router

# Include Routers with '/api' Prefix as well as Root level for maximum compatibility
app.include_router(embed_router, prefix="/api")
app.include_router(parse_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(graph_router, prefix="/api")
app.include_router(ml_router, prefix="/api")

# Node service internal routes
app.include_router(embed_router)
app.include_router(parse_router)
app.include_router(chat_router)
app.include_router(graph_router)
app.include_router(ml_router)


# Health Check Endpoints
@app.get("/internal/health")
@app.get("/api/internal/health")
async def health_check():
    return {"status": "ok", "service": "ai-service"}


if __name__ == "__main__":
    port = int(os.getenv("AI_SERVICE_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)