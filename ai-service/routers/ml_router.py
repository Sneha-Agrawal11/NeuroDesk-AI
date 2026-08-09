from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ml.analyzer import MLAnalyzer
from providers import get_ai_provider
from orchestrator import ai_orchestrator
from providers.gemini_provider import GeminiProvider
import json
import os
 
router = APIRouter(prefix="/internal/ml", tags=["ml"])
 
class ClassifyDocRequest(BaseModel):
    file_name: str
    content: str
    current_category: str = "document"
 
class ProjectHealthRequest(BaseModel):
    files: List[Dict[str, Any]]
 
class DuplicateHashRequest(BaseModel):
    content: str
 
@router.post("/classify")
async def classify_document(req: ClassifyDocRequest):
    try:
        result = MLAnalyzer.classify_document(req.content, req.file_name, req.current_category)
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
    file_path: Optional[str] = None
 
async def _get_vision_formatting(file_path: str):
    """Runs independently of the main text analysis so it can execute
    concurrently (via asyncio.gather) instead of adding sequential wait time.
    Returns (page_count, vision_data_or_None)."""
    try:
        import fitz  # PyMuPDF
        from PIL import Image
        import io as _io
 
        doc = fitz.open(file_path)
        page_count = len(doc)  # deterministic - not an LLM guess
        page_images = []
        for p in range(min(page_count, 2)):
            pix = doc[p].get_pixmap(dpi=150)
            page_images.append(Image.open(_io.BytesIO(pix.tobytes("png"))))
        doc.close()
 
        gemini = GeminiProvider()
        if not gemini.is_available():
            return page_count, None
 
        vision_prompt = (
            f"This resume has {page_count} page(s) total (this count is exact, already known - "
            "don't re-derive it). Look ONLY at the visual layout and formatting of the "
            "rendered page image(s) shown - ignore content quality/wording entirely. Judge, in "
            "order of importance for a resume: "
            "(1) Is it appropriately concise for the candidate's experience level - a resume "
            "with 2 years or less of experience should almost always fit on 1 page; more pages "
            "than needed is a real formatting weakness. "
            "(2) Is spacing CONSISTENT throughout - flag if some sections have noticeably more "
            "whitespace/padding than others, or if spacing looks uneven/patched-together. "
            "(3) Does it use one consistent font/style throughout. "
            "(4) Does content overflow awkwardly, look cramped, or misaligned. "
            "(5) Is it well-organized with clear visual hierarchy. "
            "Return ONLY pure JSON: {\"visualFormattingScore\": 0, \"formattingIssues\": [\"\"]}. "
            "Score honestly 0-100 - a genuinely messy, overflowing, or unnecessarily "
            f"multi-page (given {page_count} pages) layout MUST score below 40 even if the text "
            "content itself is good. formattingIssues should be empty if the layout is "
            "actually clean and appropriately concise."
        )
        vision_response = await gemini.client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[vision_prompt, *page_images],
        )
        vtext = (vision_response.text or "").replace("```json", "").replace("```", "").strip()
        vstart, vend = vtext.find('{'), vtext.rfind('}')
        if vstart != -1 and vend != -1:
            return page_count, json.loads(vtext[vstart:vend + 1])
        return page_count, None
    except Exception as vision_err:
        print(f"[deep_analyze] Visual formatting check skipped: {vision_err}")
        return None, None
 
 
@router.post("/deep_analyze")
async def deep_analyze_document(req: DeepAnalyzeRequest):
    try:
        prompts = {
            "resume": (
                "You are an expert ATS (Applicant Tracking System) resume coach, similar to Resume Worded or "
                "Grammarly for resumes. Analyze this resume thoroughly and honestly - scores should reflect the "
                "ACTUAL content of this specific resume, not a generic default. Return ONLY a pure JSON object "
                "(no markdown, no commentary) with this EXACT shape:\n"
                "{"
                "\"candidateOverview\": {\"name\": \"\", \"currentRole\": \"\", \"education\": \"\", "
                "\"totalExperience\": \"\", \"totalSkills\": 0, \"totalProjects\": 0, \"certifications\": 0, "
                "\"contactComplete\": true},"
                "\"atsScores\": {\"overall\": 0, \"formatting\": 0, \"keywordCoverage\": 0, \"readability\": 0, "
                "\"sectionCompleteness\": 0, \"experienceStrength\": 0, \"technicalSkills\": 0, "
                "\"projectQuality\": 0, \"achievements\": 0, \"recruiterFriendliness\": 0},"
                "\"strengths\": [\"\"],"
                "\"weaknesses\": [\"\"],"
                "\"missingKeywords\": [\"\"],"
                "\"suggestions\": [{\"before\": \"\", \"after\": \"\", \"reason\": \"\"}],"
                "\"projectImprovements\": [{\"title\": \"\", \"current\": \"\", \"improvedBullet\": \"\", "
                "\"atsOptimized\": \"\", \"recruiterFriendly\": \"\"}],"
                "\"skillsBreakdown\": {\"languages\": [\"\"], \"frameworks\": [\"\"], \"libraries\": [\"\"], "
                "\"databases\": [\"\"], \"cloud\": [\"\"], \"tools\": [\"\"], \"softSkills\": [\"\"]},"
                "\"completeness\": {\"contactDetails\": true, \"email\": true, \"phone\": true, \"github\": true, "
                "\"linkedin\": true, \"projects\": true, \"skills\": true, \"experience\": true, "
                "\"achievements\": false, \"publications\": false, \"portfolio\": false, \"openSource\": false},"
                "\"interviewQuestions\": [{\"question\": \"\", \"basedOn\": \"\"}],"
                "\"recommendations\": [\"\"]"
                "}\n"
                "Scoring guidance - use this EXACT rubric for every dimension, don't guess arbitrarily. All "
                "scores are integers 0-100:\n"
                "- formatting (0-40=inconsistent fonts/spacing/no clear sections; 41-70=mostly clean but minor "
                "inconsistencies; 71-100=clean single style, clear section headers, consistent spacing/dates)\n"
                "- keywordCoverage (0-40=few role-relevant technical keywords present; 41-70=some present but "
                "gaps in core stack for the apparent target role; 71-100=most expected keywords for that role "
                "are present)\n"
                "- readability (0-40=dense paragraphs, no bullets, hard to scan; 41-70=some bullets but "
                "inconsistent/wordy; 71-100=concise bullet points, scannable in under 10 seconds per section)\n"
                "- sectionCompleteness (count present sections out of: contact, education, experience/"
                "internships, projects, skills, certifications, achievements - score = (present/7)*100 "
                "approximately)\n"
                "- experienceStrength (0-40=no internship/work experience; 41-70=1 short internship or "
                "unclear impact; 71-100=relevant internship(s) with described responsibilities and outcomes)\n"
                "- technicalSkills (0-40=few or generic skills listed; 41-70=decent list but shallow/unverified "
                "by projects; 71-100=skills list is broad AND backed up by matching projects/experience)\n"
                "- projectQuality (0-40=projects listed with no description or impact; 41-70=described but no "
                "metrics/outcomes; 71-100=clear problem-solution-impact structure, ideally with numbers)\n"
                "- achievements (0-40=no quantified achievements anywhere; 41-70=1-2 with vague impact; "
                "71-100=multiple quantified, specific achievements with numbers/metrics)\n"
                "- recruiterFriendliness (0-40=cluttered, unclear focus, hard to find key info in 6 seconds; "
                "41-70=usable but not optimized; 71-100=name/role/contact/top skills instantly visible, clean "
                "hierarchy)\n"
                "- overall = round(average of all 9 dimensions above), don't invent a separate number.\n"
                "'keywordCoverage' should reflect how many in-demand keywords for the candidate's apparent "
                "target role are already present. 'missingKeywords' must ONLY include keywords genuinely "
                "relevant to the candidate's actual field/role (e.g. don't suggest 'Kubernetes' for a purely "
                "frontend resume unless it fits their trajectory) - suggest 5-10 realistic ones. For "
                "'suggestions', turn vague resume bullets into specific, quantified, action-verb-led versions "
                "and explain briefly why each change helps ATS score - limit to the 3-4 most impactful "
                "suggestions. For 'projectImprovements', include EVERY project mentioned in the resume with "
                "all four fields filled in. For 'completeness', infer booleans strictly from what is actually "
                "present or absent in the text. "
                "For 'currentRole': use ONLY what is literally stated on the resume (an explicit title/"
                "headline, or current job/internship title). Do NOT invent a specialization like 'AI/ML "
                "Student' or 'Full-Stack Developer' just because the projects/skills lean that direction - if "
                "the resume only states a degree like 'B.Tech in Information Technology' with no explicit "
                "target-role headline, currentRole should be exactly that degree + student status (e.g. "
                "'B.Tech Information Technology Student'), not an inferred specialty. "
                "For 'totalExperience': carefully calculate calendar months between each listed start/end date "
                "(e.g. 'Dec 2025 - Jan 2026' spans 2 calendar months: December and January - count every "
                "calendar month touched by the range, don't subtract as if it were exact days). Sum all work/"
                "internship periods (not education). If dates are genuinely absent or unclear, say 'Not "
                "specified' rather than guessing a number. "
                "For 'interviewQuestions': generate 6-8 questions a real interviewer would plausibly ask THIS "
                "specific candidate, each grounded in an actual project, skill, or experience line from THIS "
                "resume (not generic questions) - set 'basedOn' to the specific resume item that prompted it "
                "(e.g. 'NeuroDesk AI project' or 'Python skill'). Mix technical, behavioral, and project-deep-"
                "dive questions. "
                "IMPORTANT: keep every text field SHORT (1-2 sentences max, ideally under 25 words) - this is a "
                "structured dashboard, not an essay. Being concise in every field matters more than being "
                "exhaustive, since the full JSON must fit completely within the output limit."
            ),
            "assignment": "Extract from this assignment as pure JSON object: {\"summary\": \"\", \"keyConcepts\": [\"\"], \"importantTopics\": [\"\"], \"definitions\": [\"\"], \"qaPairs\": {\"Q\": \"A\"}, \"quiz\": [\"Q: A\"]}",
            "research_paper": "Extract from this research paper as pure JSON object: {\"abstract\": \"\", \"problemStatement\": \"\", \"methodology\": \"\", \"keywords\": [\"\"], \"results\": \"\", \"limitations\": \"\", \"futureWork\": \"\", \"citation\": \"\"}",
            "invoice": "Extract from this invoice as pure JSON object: {\"summary\": \"\", \"vendor\": \"\", \"date\": \"\", \"amount\": \"\", \"tax\": \"\", \"paymentStatus\": \"\", \"items\": [\"\"]}",
            "image": "Describe this image content as pure JSON object: {\"sceneDescription\": \"\", \"visualTags\": [\"\"], \"detectedObjects\": [\"\"], \"colours\": [\"\"], \"faces\": \"\", \"ocrText\": \"\"}",
            "presentation": "Extract from this presentation as pure JSON object: {\"slideSummary\": \"\", \"importantTopics\": [\"\"], \"keyPoints\": [\"\"]}",
            "certificate": "Extract from this certificate as pure JSON object: {\"issuer\": \"\", \"candidate\": \"\", \"completionDate\": \"\", \"summary\": \"\", \"details\": [\"\"]}",
            "project": "Analyze this project as pure JSON object: {\"architecture\": \"\", \"techStack\": [\"\"], \"folderStructure\": \"\", \"frontend\": \"\", \"backend\": \"\", \"database\": \"\", \"authentication\": \"\", \"apis\": [\"\"], \"routes\": [\"\"], \"mlModels\": [\"\"], \"configuration\": \"\", \"environment\": \"\", \"securityIssues\": [\"\"], \"performanceIssues\": [\"\"], \"missingFiles\": [\"\"], \"readme\": \"\", \"resumePoints\": [\"\"], \"interviewQuestions\": [\"\"], \"improvementSuggestions\": [\"\"], \"healthScore\": 90}"
        }
 
        # Default fallback
        prompt = prompts.get(req.category, "Summarize this document as pure JSON object: {\"summary\": \"\", \"keyConcepts\": [\"\"]}")
        
        from datetime import date
        today_str = date.today().strftime("%B %d, %Y")
        full_prompt = (
            f"Today's real-world date is {today_str}. Use this to correctly judge whether any dates "
            f"mentioned (internships, education, certifications) are in the past (already completed) or "
            f"future (upcoming/planned) - do not assume based on your training data, use the date given here.\n\n"
            f"{prompt}\n\nDocument Text:\n{req.content[:15000]}"
        )
 
        LARGE_SCHEMA_CATEGORIES = {"resume", "project"}
        gen_options = {"max_output_tokens": 8192} if req.category in LARGE_SCHEMA_CATEGORIES else None
 
        TASK_BY_CATEGORY = {
            "resume": "RESUME_ANALYSIS",
            "project": "PROJECT_ANALYSIS",
            "image": "IMAGE_ANALYSIS",
        }
        task = TASK_BY_CATEGORY.get(req.category, "DOCUMENT_ANALYSIS")
 
        needs_vision = (
            req.category == "resume" and req.file_path
            and req.file_path.lower().endswith(".pdf") and os.path.exists(req.file_path)
        )
 
        import asyncio
        if needs_vision:
            result, (page_count, vision_data) = await asyncio.gather(
                ai_orchestrator.generate(task, full_prompt, gen_options),
                _get_vision_formatting(req.file_path),
            )
        else:
            result = await ai_orchestrator.generate(task, full_prompt, gen_options)
            page_count, vision_data = None, None
 
        if not result["success"]:
            return {"success": False, "error": result.get("error", "All AI providers are currently unavailable"), "raw": ""}
        response_text = result["content"]
 
        # Parse JSON from response
        try:
            # Clean up markdown if any
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            try:
                data = json.loads(clean_text)
            except json.JSONDecodeError:
                # Model occasionally adds a stray sentence before/after the JSON
                # block (especially for large schemas like resume analysis).
                # Fall back to extracting the outermost {...} span.
                start = clean_text.find('{')
                end = clean_text.rfind('}')
                if start == -1 or end == -1 or end <= start:
                    raise
                data = json.loads(clean_text[start:end + 1])
 
            data["_provider"] = result["provider"]
            data["_fallbackUsed"] = result["fallbackUsed"]
 
            # Text extraction linearizes content, so visual layout problems
            # (content overflowing onto an extra page, misalignment, cramped
            # spacing) are invisible to a text-only analysis - a genuinely
            # messy resume can still read fine as plain text. For resumes,
            # actually LOOK at the rendered page image and use that for the
            # formatting score instead of guessing from text structure alone.
            if page_count is not None:
                data["pageCount"] = page_count
            if vision_data:
                if isinstance(vision_data.get("visualFormattingScore"), (int, float)) and "atsScores" in data:
                    data["atsScores"]["formatting"] = int(vision_data["visualFormattingScore"])
                issues = vision_data.get("formattingIssues") or []
                if issues:
                    data.setdefault("weaknesses", [])
                    data["weaknesses"] = list(data["weaknesses"]) + [f"Formatting: {i}" for i in issues[:3]]
 
            return {"success": True, "analysis": data}
        except Exception as e:
            return {"success": False, "error": "Failed to parse JSON", "raw": response_text}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
 