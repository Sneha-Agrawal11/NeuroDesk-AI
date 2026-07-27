# NeuroDesk AI Project Report

## Summary
NeuroDesk AI is a three-service local-first knowledge assistant comprising a Next.js frontend, an Express/Node orchestration backend, and a FastAPI AI service. The pipeline covers multimodal file import, OCR, parsing, chunking, embedding, semantic search, AI chat, knowledge graph extraction, ML classification, and duplicate detection.

## Execution Context
- **Total Documents in Dataset**: 500
- **Successfully Parsed Documents**: 500
- **Total Chunks**: 949
- **Documents Embedded in ChromaDB**: 50
- **Parse Failures**: 0
- **Evaluation Iterations**: 10
- **Embedding Dimension**: 384 (all-MiniLM-L6-v2)

## Key Metrics (10 iterations, Mean ± StdDev)

| Metric | Mean | Median | Min | Max | StdDev |
|--------|------|--------|-----|-----|--------|
| **OCR Accuracy** | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% |
| **Document Classification Accuracy** | 80.0% | 80.0% | 80.0% | 80.0% | 0.0% |
| **Duplicate Detection Accuracy** | 50.0% | 50.0% | 50.0% | 50.0% | 0.0% |
| **Semantic Retrieval Precision@5** | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% |
| **Semantic Retrieval Recall@5** | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% |
| **MRR@5** | 1 | 1 | 1 | 1 | 0 |
| **Semantic Search Latency (ms)** | 42.78 | 41.79 | 36.12 | 51.88 | 5.3 |
| **Embedding Generation Latency (ms)** | 119.98 | 117 | 66.9 | 260.91 | 39.22 |
| **AI Response Latency (ms)** | 4.44 | 4.24 | 3.07 | 5.36 | 0.72 |
| **Workspace Indexing Speed (ms/batch)** | 1309.59 | 1146.86 | 213.87 | 3465.84 | 913.79 |
| **Knowledge Graph Nodes (per doc)** | 1.4 | 1 | 0 | 3 | 0.8 |
| **Knowledge Graph Edges (per doc)** | 0 | 0 | 0 | 0 | 0 |
| **CPU Usage (User Time ms/batch)** | 9.3 | 7.5 | 0 | 31 | 10.29 |
| **Peak Memory Usage (MB/batch)** | 2.19 | 2.29 | 0.56 | 4.93 | 1.52 |

## Architecture
- **Frontend**: Next.js with real-time workspace UI, analytics dashboard, and chat interface
- **Backend**: Express.js with Prisma ORM, SQLite, background workers (Better-Queue)
- **AI Service**: FastAPI with SentenceTransformers, ChromaDB, Tesseract OCR, MinHash duplicate detection
- **Embedding Model**: all-MiniLM-L6-v2 (384 dimensions)
- **Vector Store**: ChromaDB (local persistent storage)
