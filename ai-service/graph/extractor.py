import re
from typing import List, Dict, Any

class GraphExtractor:
    """
    Extracts entities and relationships from text/code for the Knowledge Graph.
    Uses regex, heuristics, and can be extended with Spacy NLP models.
    """
    
    @staticmethod
    def extract_technologies(text: str) -> List[str]:
        """Detect tech stack from content (e.g. package.json, resumes, READMEs)."""
        common_tech = ["react", "node.js", "python", "typescript", "fastapi", "express", 
                       "docker", "kubernetes", "aws", "gcp", "azure", "sql", "sqlite", 
                       "postgres", "mongodb", "prisma", "rust", "go", "java", "c++", "c#",
                       "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy"]
                       
        found = set()
        text_lower = text.lower()
        for tech in common_tech:
            if re.search(r'\b' + re.escape(tech) + r'\b', text_lower):
                found.add(tech)
                
        return list(found)

    @staticmethod
    def extract_relationships(file_name: str, content: str, all_files: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        relationships = []
        
        # Heuristic 1: Code Imports
        if file_name.endswith(('.ts', '.js', '.tsx', '.jsx')):
            imports = re.findall(r'from\s+[\'"]([^\'"]+)[\'"]', content)
            imports += re.findall(r'require\([\'"]([^\'"]+)[\'"]\)', content)
            for imp in imports:
                for f in all_files:
                    if imp.strip('./').split('/')[-1] in f['name']:
                        relationships.append({
                            "target_id": f['id'],
                            "type": "imports",
                            "confidence": 0.9,
                            "context": f"Imports {imp}"
                        })
        elif file_name.endswith('.py'):
            imports = re.findall(r'import\s+([a-zA-Z0-9_]+)', content)
            imports += re.findall(r'from\s+([a-zA-Z0-9_]+)\s+import', content)
            for imp in imports:
                for f in all_files:
                    if imp in f['name']:
                        relationships.append({
                            "target_id": f['id'],
                            "type": "imports",
                            "confidence": 0.9,
                            "context": f"Imports {imp}"
                        })

        # Code Entities (Classes, Functions)
        classes = re.findall(r'class\s+([a-zA-Z0-9_]+)', content)
        functions = re.findall(r'def\s+([a-zA-Z0-9_]+)', content) + re.findall(r'function\s+([a-zA-Z0-9_]+)', content)
        
        for c in classes:
            # We treat definitions as self-referential or we can expose them as nodes. 
            pass # In a deeper implementation, we would return these as graph nodes.

        # API Endpoints
        apis = re.findall(r'(app|router)\.(get|post|put|delete)\([\'"]([^\'"]+)[\'"]', content)
        for api in apis:
            pass # Similarly, can be returned as nodes
        
        # Heuristic 2: References / Mentions
        for f in all_files:
            if f['id'] == file_name: continue
            
            if re.search(r'\b' + re.escape(f['name'].split('.')[0]) + r'\b', content, re.IGNORECASE):
                relationships.append({
                    "target_id": f['id'],
                    "type": "references",
                    "confidence": 0.7,
                    "context": f"Mentions {f['name']}"
                })
                
        unique_rels = { f"{r['target_id']}_{r['type']}": r for r in relationships }
        return list(unique_rels.values())
