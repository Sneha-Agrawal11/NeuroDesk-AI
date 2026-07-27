import os
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import logging

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        self.model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        self.persist_dir = os.getenv("CHROMA_PERSIST_DIR", "../data/chromadb")
        
        logger.info(f"Loading embedding model: {self.model_name}")
        # Initialize the local embedding model
        self.model = SentenceTransformer(self.model_name, device="cpu")
        print("Embedding model loaded successfully on CPU.")
        
        # Initialize ChromaDB client
        self.chroma_client = chromadb.PersistentClient(path=self.persist_dir)
        
        # Create or get the main collection
        self.collection = self.chroma_client.get_or_create_collection(
            name="file_chunks",
            metadata={"hnsw:space": "cosine"}
        )
        logger.info("Embedding service initialized")

    def generate_embedding(self, text: str) -> list[float]:
        """Generate a single embedding for text."""
        return self.model.encode(text).tolist()
        
    def generate_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts."""
        embeddings = self.model.encode(texts)
        return [emb.tolist() for emb in embeddings]

    def store_chunks(self, file_id: str, chunks: list[dict]):
        """Store text chunks and their embeddings in ChromaDB."""
        if not chunks:
            return
            
        texts = [chunk["content"] for chunk in chunks]
        embeddings = self.generate_embeddings_batch(texts)
        
        ids = [f"{file_id}_{chunk['chunk_index']}" for chunk in chunks]
        metadatas = [
            {
                "file_id": file_id,
                "chunk_index": chunk["chunk_index"],
                "category": chunk.get("category", "unknown"),
                "project_id": chunk.get("project_id", ""),
                "filename": chunk.get("filename", "")
            }
            for chunk in chunks
        ]
        
        # Upsert into ChromaDB
        self.collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )
        
        return ids

    def search(self, query: str, limit: int = 10, filters: dict = None) -> list[dict]:
        """Search ChromaDB using semantic similarity."""
        query_embedding = self.generate_embedding(query)
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            where=filters if filters else None,
            include=["documents", "metadatas", "distances"]
        )
        
        if not results["ids"] or not results["ids"][0]:
            return []
            
        # Format results
        formatted_results = []
        for i in range(len(results["ids"][0])):
            formatted_results.append({
                "id": results["ids"][0][i],
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i]  # Lower distance = higher similarity
            })
            
        return formatted_results

    def delete_file(self, file_id: str):
        """Remove every vector owned by a file when it is deleted or reindexed."""
        self.collection.delete(where={"file_id": file_id})

# Singleton instance
embedding_service = None

def get_embedding_service() -> EmbeddingService:
    global embedding_service
    if embedding_service is None:
        embedding_service = EmbeddingService()
    return embedding_service
