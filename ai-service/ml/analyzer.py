from typing import Dict, Any, List
import json
import re
import hashlib
from datasketch import MinHash

class MLAnalyzer:
    """
    Dedicated Machine Learning layer independent of the core LLM reasoning.
    Handles Classification, Scoring, and Explainability.
    """

    @staticmethod
    def classify_document(text: str, file_name: str, current_category: str = "document") -> Dict[str, Any]:
        """
        Classify document type using heuristics/ML.

        `current_category` is the category already derived from the file
        extension upstream (image, presentation, spreadsheet, code, etc).
        That's a reliable signal we should never discard - this function's
        job is only to refine the ambiguous "generic document" bucket
        (resume vs research paper vs certificate vs plain document), not to
        re-guess categories it has no real signal for.
        """
        RELIABLE_EXTENSION_CATEGORIES = {"image", "presentation", "spreadsheet", "code"}
        if current_category in RELIABLE_EXTENSION_CATEGORIES:
            return {"category": current_category, "confidence": 1.0}

        name_lower = file_name.lower()
        text_lower = text.lower()

        category = current_category or "document"
        confidence = 0.5

        if "resume" in name_lower or "cv" in name_lower or "experience" in text_lower[:500]:
            category = "resume"
            confidence = 0.8
        elif "abstract" in text_lower[:1000] and "conclusion" in text_lower:
            category = "research_paper"
            confidence = 0.85
        elif "certificate" in name_lower or "completed" in text_lower[:200]:
            category = "certificate"
            confidence = 0.7
        elif any(name_lower.endswith(ext) for ext in ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']):
            category = "code"
            confidence = 0.9

        return {"category": category, "confidence": confidence}

    @staticmethod
    def analyze_project_health(files_metadata: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculates Project Health Score and provides an explainability breakdown.
        """
        score = 50 # Base score
        factors = []
        
        file_names = [f.get("filename", "").lower() for f in files_metadata]
        
        if "readme.md" in file_names or "readme.txt" in file_names:
            score += 20
            factors.append("+20: Project has a README")
        else:
            factors.append("-0: Missing README documentation")
            
        if "package.json" in file_names or "requirements.txt" in file_names or "cargo.toml" in file_names:
            score += 15
            factors.append("+15: Uses a package manager (dependency tracking)")
            
        if ".env.example" in file_names or "docker-compose.yml" in file_names:
            score += 10
            factors.append("+10: Contains environment/deployment configuration")
            
        if ".gitignore" in file_names:
            score += 5
            factors.append("+5: Configured version control ignores")
            
        final_score = min(score, 100)
        
        return {
            "health_score": final_score,
            "explanation": factors
        }

    @staticmethod
    def calculate_duplicate_hash(text: str) -> Dict[str, str]:
        """
        Uses SHA256 for exact match and MinHash for near-duplicate detection.
        """
        # Exact Hash
        exact_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()
        
        # MinHash for near duplicates
        words = text.lower().split()
        m = MinHash(num_perm=128)
        for w in set(words):
            m.update(w.encode('utf-8'))
            
        # Serialize minhash to a stable hex string representing the hash values
        near_duplicate_hash = "".join([f"{x:08x}" for x in m.hashvalues])
        
        return {
            "exact_hash": exact_hash,
            "near_duplicate_hash": near_duplicate_hash
        }
