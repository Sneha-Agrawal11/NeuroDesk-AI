import time
import json
import logging
from ml.analyzer import MLAnalyzer
from graph.extractor import GraphExtractor
from embedding.service import get_embedding_service

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Benchmark")

# 1. Classification Dataset
classification_data = [
    {"text": "Experienced Software Engineer with 5 years in Python and React. Built scalable microservices.", "name": "john_doe_resume.pdf", "expected": "resume"},
    {"text": "This paper presents a novel approach to graph neural networks. We abstract the layers... Conclusion: results are state-of-the-art.", "name": "gnn_paper.pdf", "expected": "research_paper"},
    {"text": "Certificate of Completion: Jane Doe has successfully completed Advanced Machine Learning.", "name": "aws_cert.pdf", "expected": "certificate"},
    {"text": "def hello_world():\n    print('hello world')", "name": "main.py", "expected": "document"}
]

# 2. Duplicate Detection Dataset
duplicate_data = [
    ("The quick brown fox jumps over the lazy dog.", "The quick brown fox jumps over the lazy dog.", True),
    ("NeuroDesk AI is an awesome personal knowledge system.", "NeuroDesk AI is an awesome personal knowledge system.", True),
    ("NeuroDesk AI is an awesome personal knowledge system.", "NeuroDesk AI is a terrible system.", False),
]

def run_benchmarks():
    logger.info("Starting NeuroDesk AI Benchmarking Suite...")
    metrics = {}

    # --- 1. Document Classification Benchmark ---
    logger.info("Running Document Classification Benchmark...")
    correct = 0
    start_time = time.time()
    
    for item in classification_data:
        result = MLAnalyzer.classify_document(item["text"], item["name"])
        if result["category"] == item["expected"]:
            correct += 1
            
    end_time = time.time()
    
    metrics["Document Classification Accuracy"] = f"{(correct / len(classification_data)) * 100:.2f}%"
    metrics["Document Classification Inference Time"] = f"{(end_time - start_time) / len(classification_data):.4f}s per document"

    # --- 2. Duplicate Detection Benchmark ---
    logger.info("Running Duplicate Detection Benchmark...")
    correct_dup = 0
    start_time = time.time()
    
    for text1, text2, is_dup in duplicate_data:
        hash1 = MLAnalyzer.calculate_duplicate_hash(text1)
        hash2 = MLAnalyzer.calculate_duplicate_hash(text2)
        predicted_dup = (hash1 == hash2)
        if predicted_dup == is_dup:
            correct_dup += 1
            
    end_time = time.time()
    
    metrics["Duplicate Detection Accuracy"] = f"{(correct_dup / len(duplicate_data)) * 100:.2f}%"
    metrics["Duplicate Hashing Speed"] = f"{(end_time - start_time) / (len(duplicate_data) * 2):.5f}s per hash"

    # --- 3. Knowledge Graph Extraction Benchmark ---
    logger.info("Running Knowledge Graph Benchmark...")
    code_snippet = "import os\nfrom utils import helper\n\n# React and Node.js are cool\nprint('Done')"
    workspace_files = [{"id": "1", "name": "utils.py"}, {"id": "2", "name": "helper.py"}]
    
    start_time = time.time()
    for _ in range(10): # Run 10 times for average
        techs = GraphExtractor.extract_technologies(code_snippet)
        rels = GraphExtractor.extract_relationships("main.py", code_snippet, workspace_files)
    end_time = time.time()
    
    metrics["Technology Detection Speed"] = f"{(end_time - start_time) / 10:.4f}s per file"
    
    # --- 4. Embedding Generation Benchmark ---
    logger.info("Running Embedding Generation Benchmark...")
    try:
        service = get_embedding_service()
        texts_to_embed = ["This is a test sentence for embeddings."] * 5
        
        start_time = time.time()
        service.generate_embeddings_batch(texts_to_embed)
        end_time = time.time()
        
        metrics["Embedding Generation Time"] = f"{(end_time - start_time) / 5:.4f}s per chunk"
        metrics["Embedding Model Loaded"] = service.model_name
    except Exception as e:
        metrics["Embedding Generation Time"] = f"Failed to load embedding model: {str(e)}"
        
    print("\n" + "="*50)
    print("BENCHMARK RESULTS")
    print("="*50)
    print(json.dumps(metrics, indent=2))
    print("="*50 + "\n")
    
    return metrics

if __name__ == "__main__":
    run_benchmarks()
