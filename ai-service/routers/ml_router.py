from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ml.analyzer import MLAnalyzer
from providers.gemini_provider import GeminiProvider
import json

router = APIRouter(prefix="/internal/ml", tags=["ml"])

class ClassifyDocRequest(BaseModel):
    file_name: str
    content: str

class ProjectHealthRequest(BaseModel):
    files: List[Dict[str, Any]]

class DuplicateHashRequest(BaseModel):
    content: str

@router.post("/classify")
async def classify_document(req: ClassifyDocRequest):
    try:
        result = MLAnalyzer.classify_document(req.content, req.file_name)
        return {"success": True, "classification": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/project/health")
async def analyze_project_health(req: ProjectHealthRequest):
    try:
        result = MLAnalyzer.analyze_project_health(req.files)
        return {"success": True, "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/duplicate/hash")
async def get_duplicate_hash(req: DuplicateHashRequest):
    try:
        hash_val = MLAnalyzer.calculate_duplicate_hash(req.content)
        return {"success": True, "near_duplicate_hash": hash_val}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DeepAnalyzeRequest(BaseModel):
    content: str
    category: str
    filename: str

@router.post("/deep_analyze")
async def deep_analyze_document(req: DeepAnalyzeRequest):
    try:
        gemini = GeminiProvider()
        if not gemini.is_available():
            return {"success": False, "error": "Gemini not available"}

        prompts = {
            "resume": "Extract the following from this resume as a pure JSON object (do not use markdown blocks): {\"summary\": \"\", \"atsScore\": 85, \"education\": [\"\"], \"skills\": [\"\"], \"experience\": [\"\"], \"projects\": [\"\"], \"achievements\": [\"\"], \"strengths\": [\"\"], \"missingSkills\": [\"\"], \"interviewQuestions\": [\"\"], \"improvements\": [\"\"]}",
            "assignment": "Extract from this assignment as pure JSON object: {\"summary\": \"\", \"keyConcepts\": [\"\"], \"importantTopics\": [\"\"], \"definitions\": [\"\"], \"qaPairs\": {\"Q\": \"A\"}, \"quiz\": [\"Q: A\"]}",
            "research_paper": "Extract from this research paper as pure JSON object: {\"abstract\": \"\", \"problemStatement\": \"\", \"methodology\": \"\", \"keywords\": [\"\"], \"results\": \"\", \"limitations\": \"\", \"futureWork\": \"\", \"citation\": \"\"}",
            "invoice": "Extract from this invoice as pure JSON object: {\"summary\": \"\", \"vendor\": \"\", \"date\": \"\", \"amount\": \"\", \"tax\": \"\", \"paymentStatus\": \"\", \"items\": [\"\"]}",
            "image": "Describe this image content as pure JSON object: {\"sceneDescription\": \"\", \"visualTags\": [\"\"], \"detectedObjects\": [\"\"], \"colours\": [\"\"], \"faces\": \"\", \"ocrText\": \"\"}",
            "project": "Analyze this project as pure JSON object: {\"architecture\": \"\", \"techStack\": [\"\"], \"folderStructure\": \"\", \"frontend\": \"\", \"backend\": \"\", \"database\": \"\", \"authentication\": \"\", \"apis\": [\"\"], \"routes\": [\"\"], \"mlModels\": [\"\"], \"configuration\": \"\", \"environment\": \"\", \"securityIssues\": [\"\"], \"performanceIssues\": [\"\"], \"missingFiles\": [\"\"], \"readme\": \"\", \"resumePoints\": [\"\"], \"interviewQuestions\": [\"\"], \"improvementSuggestions\": [\"\"], \"healthScore\": 90}"
        }

        # Default fallback
        prompt = prompts.get(req.category, "Summarize this document as pure JSON object: {\"summary\": \"\", \"keyConcepts\": [\"\"]}")
        
        full_prompt = f"{prompt}\n\nDocument Text:\n{req.content[:15000]}"
        
        response_text = await gemini.generate(full_prompt)
        
        # Parse JSON from response
        try:
            # Clean up markdown if any
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_text)
            return {"success": True, "analysis": data}
        except Exception as e:
            return {"success": False, "error": "Failed to parse JSON", "raw": response_text}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
