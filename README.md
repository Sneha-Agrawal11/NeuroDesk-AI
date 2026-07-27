# NeuroDesk AI

**AI-Powered Personal Knowledge Operating System**

NeuroDesk AI is not just a file manager or a chatbot. It is a deeply integrated, local-first operating system layer that understands everything you own—your projects, source code, research papers, resumes, and notes—allowing you to search, understand, and interact with your digital knowledge naturally.

Think of it as combining **Raycast**, **Cursor AI**, **Notion AI**, and **Windows Search** into a single cohesive, privacy-first desktop application.

---

## 🚀 Features

- **Recursive Workspace Scanner**: Automatically detects projects, extracts metadata, and categorizes files (code, documents, images) using intelligent heuristics and ML classification.
- **Hybrid Search Engine**: Blends raw speed (SQLite FTS5 keyword search) with deep understanding (ChromaDB semantic search) using Reciprocal Rank Fusion (RRF).
- **Knowledge Graph**: Automatically maps relationships between files. (e.g. "Project X uses React", "File A imports File B").
- **Local-First & Privacy Focused**: By default, data is processed locally. Connects to local LLMs (Ollama) or external APIs (Gemini, OpenAI) strictly via provider abstraction.
- **Contextual AI Chat**: Chat with your entire workspace. The AI builds a context window from recently accessed projects and semantically relevant file chunks, complete with source citations.
- **Dedicated ML Layer**: Handles document classification, duplicate detection hashing, and project health scoring independent of the Generative LLM.
- **Desktop Native**: Packaged securely with Electron, giving the Next.js frontend access to native file pickers and OS integrations.

## 🏗️ Architecture

- **Frontend**: Next.js 16, React, Tailwind 4, Framer Motion (Glass-morphism UI).
- **Desktop Shell**: Electron (Secure IPC, Preload scripts).
- **Backend API**: Node.js + Express + TypeScript + Prisma + SQLite.
- **AI & ML Engine**: Python + FastAPI + ChromaDB + SentenceTransformers.

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- `pnpm` (Package manager)

### 1. Initialize the Environment
Run the automated setup script to install all Node/Python dependencies, generate the Prisma client, and create the SQLite database.
```powershell
.\scripts\setup.ps1
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your API keys (e.g., `GEMINI_API_KEY`).

### 3. Run for Development
To start the Next.js frontend, Express API, and FastAPI services simultaneously:
```powershell
.\scripts\dev.ps1
```

### 4. Run the Desktop App (Electron)
To launch the native desktop shell instead of the browser:
```powershell
pnpm run desktop
```

## 📊 Benchmarking & Evaluation

NeuroDesk AI includes a dedicated benchmarking suite to evaluate the ML pipeline and Search engine performance locally on your machine.

To run the benchmarks:
```powershell
cd ai-service
.\.venv\Scripts\activate
python benchmark.py
```

## 🔒 Privacy & Security

No file contents leave your machine unless explicitly sent to an external LLM provider (like Gemini or OpenAI) during a chat query. If you use a local provider like Ollama, the entire system operates 100% offline. Vector embeddings (ChromaDB) and file metadata (SQLite) are always stored locally in the `/data` directory.

---
*Built as a portfolio-grade commercial application architecture.*
