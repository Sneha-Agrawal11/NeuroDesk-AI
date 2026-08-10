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
 
# Below this many characters of extracted text, a one-page resume is almost
# certainly mostly blank space - a real, reasonably filled one-page resume
# typically runs 1500-3000+ characters. This threshold is used as a
# deterministic (non-AI) signal so "this page is mostly empty" gets flagged
# correctly regardless of which provider (Gemini/Groq/Ollama) answers, and
# regardless of whether the vision-based layout check succeeded or not.
SPARSE_RESUME_CHAR_THRESHOLD = 1200
 
 
async def _get_vision_formatting(file_path: str):
    """Runs independently of the main text analysis so it can execute
    concurrently (via asyncio.gather) instead of adding sequential wait time.
    Returns (page_count, vision_data_or_None).
 
    IMPORTANT: page_count is computed deterministically from the PDF itself
    (not the LLM) and must survive even if the Gemini vision call fails,
    times out, or the model isn't available - losing it there was the bug
    that made "Length" disappear from the dashboard whenever Gemini's vision
    call hit a transient 503/timeout.
    """
    import asyncio
 
    # --- Step 1: deterministic page count + page render. If THIS fails,
    # we genuinely have nothing to show, so None,None is correct here. ---
    try:
        import fitz  # PyMuPDF
        from PIL import Image
        import io as _io
 
        doc = fitz.open(file_path)
        page_count = len(doc)
        page_images = []
        for p in range(min(page_count, 2)):
            pix = doc[p].get_pixmap(dpi=150)
            page_images.append(Image.open(_io.BytesIO(pix.tobytes("png"))))
        doc.close()
    except Exception as pdf_err:
        print(f"[deep_analyze] PDF page-count/render FAILED: {pdf_err}")
        return None, None
 
    # --- Step 2: Gemini vision call. If THIS fails, we still return the
    # page_count we already have - just without the AI formatting critique. ---
    try:
        gemini = GeminiProvider()
        if not gemini.is_available():
            return page_count, None
 
        vision_prompt = (
            f"This resume has {page_count} page(s) total (this count is exact, already known - "
            "don't re-derive it). Look ONLY at the visual layout and formatting of the "
            "rendered page image(s) shown - ignore content quality/wording entirely. Be BRUTALLY HONEST, "
            "not diplomatic - if the layout is genuinely sparse, unbalanced, or messy, say so directly and "
            "score it low; a lenient score for a visibly poor layout is a failure of this check. Judge, in "
            "order of importance for a resume: "
            "(1) Is it appropriately concise for the candidate's experience level - a resume "
            "with 2 years or less of experience should almost always fit on 1 page; more pages "
            "than needed is a real formatting weakness. "
            "(2) Is spacing CONSISTENT throughout - flag if some sections have noticeably more "
            "whitespace/padding than others, large empty gaps, sparse/uneven content distribution, or if "
            "spacing looks uneven/patched-together. "
            "(3) Does it use one consistent font/style throughout. "
            "(4) Does content overflow awkwardly, look cramped, or misaligned. "
            "(5) Is it well-organized with clear visual hierarchy, or does it look sparse/empty/unbalanced. "
            "Reference SPECIFIC section names and details you can actually see on THIS page image "
            "(e.g. name an actual section header, or describe an actual gap you see) rather than generic "
            "template phrasing - two different resumes should never get near-identical wording. "
            "Return ONLY pure JSON: {\"visualFormattingScore\": 0, \"formattingIssues\": [\"\"]}. "
            "Score honestly 0-100 - a genuinely messy, sparse, unbalanced, overflowing, or unnecessarily "
            f"multi-page (given {page_count} pages) layout MUST score below 40 even if the text "
            "content itself is good. If the majority of the page is blank/unused whitespace, score below 20 "
            "and say so explicitly - this is the single most important thing to catch. formattingIssues "
            "should be empty ONLY if the layout is actually clean, well-balanced, and appropriately concise - "
            "list every real issue you see otherwise, don't hold back to just 1-2 generic items."
        )
 
        last_err = None
        vision_response = None
        for attempt in range(2):
            try:
                vision_response = await gemini.client.aio.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[vision_prompt, *page_images],
                )
                break
            except Exception as e:
                last_err = e
                if attempt == 0:
                    print(f"[deep_analyze] Vision check attempt 1 failed ({e}), retrying once...")
                    await asyncio.sleep(1.5)
                    continue
                raise
 
        vtext = (vision_response.text or "").replace("```json", "").replace("```", "").strip()
        vstart, vend = vtext.find('{'), vtext.rfind('}')
        if vstart != -1 and vend != -1:
            parsed = json.loads(vtext[vstart:vend + 1])
            print(f"[deep_analyze] Vision formatting check SUCCEEDED: score={parsed.get('visualFormattingScore')}, issues={parsed.get('formattingIssues')}")
            return page_count, parsed
        print(f"[deep_analyze] Vision formatting check returned unparseable text: {vtext[:200]}")
        return page_count, None
    except Exception as vision_err:
        print(f"[deep_analyze] Visual formatting AI check FAILED (page_count={page_count} still preserved): {vision_err}")
        return page_count, None
 
 
@router.post("/deep_analyze")
async def deep_analyze_document(req: DeepAnalyzeRequest):
    try:
        prompts = {
            "resume": (
                "You are an expert ATS (Applicant Tracking System) resume coach, similar to Resume Worded or "
                "Grammarly for resumes. Analyze this resume thoroughly and BRUTALLY HONESTLY - scores and "
                "weaknesses should reflect the ACTUAL content and layout of THIS specific resume. Do not soften "
                "criticism to be polite. If the resume is sparse, poorly organized, inconsistently spaced, or "
                "has very little real content, say so directly and score it low - a diplomatic 'minor "
                "improvement' framing for a genuinely weak resume is a failure of this analysis, not "
                "kindness.\n\n"
                "MANDATORY DEPTH REQUIREMENT - this applies no matter which AI model is answering this "
                "request, and no matter how sparse or short the resume is: shallow, generic, single-line "
                "entries like 'No achievements mentioned' or 'Lack of project descriptions' with nothing else "
                "are a FAILED response. Every array below has a REQUIRED minimum length - if you cannot find "
                "enough real, distinct issues to hit the minimum, that itself means the resume has deeper "
                "problems you haven't dug into yet (formatting inconsistencies, vague wording, missing context, "
                "unclear impact, generic phrasing, poor keyword targeting, etc.) - keep analyzing until you "
                "genuinely have that many SPECIFIC, non-redundant points, each citing something concrete from "
                "the resume text itself (a quoted phrase, a named section, a specific missing detail) rather "
                "than a generic category label:\n"
                "- strengths: minimum 3 items (if the resume truly has fewer real strengths, say so as one of "
                "the weaknesses instead of padding strengths with weak ones)\n"
                "- weaknesses: minimum 5 items, each specific and non-overlapping\n"
                "- missingKeywords: 5-10 items\n"
                "- suggestions: minimum 3 items\n"
                "- recommendations: minimum 4 items, each a concrete actionable next step (not vague advice "
                "like 'improve your resume' - say exactly what to add/change/quantify)\n"
                "- interviewQuestions: minimum 6 items\n"
                "- projectImprovements: one entry per project actually mentioned in the resume (if none, this "
                "can be empty)\n\n"
                "Return ONLY a pure JSON object "
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
                "inconsistencies; 71-100=clean single style, clear section headers, consistent spacing/dates). "
                "If you cannot see the actual rendered page (no visual layout data given to you), and the "
                "extracted text content is very short/sparse for a resume, you MUST assume the layout is "
                "mostly blank page space and score formatting LOW (below 30) rather than guessing generously "
                "just because a few section labels are present in the text - the mere presence of words like "
                "'Experience:' or 'Skills:' does NOT mean the page is well-formatted or full.\n"
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
                "and explain briefly why each change helps ATS score. For 'projectImprovements', include EVERY "
                "project mentioned in the resume with all four fields filled in. For 'completeness', infer "
                "booleans strictly from what is actually present or absent in the text. "
                "For EVERY field in 'candidateOverview': never leave a field blank, null, or omitted - if the "
                "resume genuinely doesn't state something, put the literal string 'Not specified' instead of "
                "leaving it empty. Always attempt a best-effort extraction first (e.g. a name is almost always "
                "present somewhere even in a sparse resume) before falling back to 'Not specified'. "
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
                "For 'interviewQuestions': generate questions a real interviewer would plausibly ask THIS "
                "specific candidate, each grounded in an actual project, skill, or experience line from THIS "
                "resume (not generic questions) - set 'basedOn' to the specific resume item that prompted it "
                "(e.g. 'NeuroDesk AI project' or 'Python skill'). Mix technical, behavioral, and project-deep-"
                "dive questions. "
                "Keep every text field to 1-2 sentences (under 25 words) so it fits a structured dashboard - "
                "but 'short per item' does NOT mean 'fewer items'. Hitting every minimum count above with real, "
                "specific, non-generic content matters more than brevity - do not sacrifice the required "
                "number of items to save space."
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
        # Resumes are short documents (1-2 pages) - 15000 chars was overkill
        # and was the main driver of a single request nearly exhausting
        # Groq's free-tier 12000 tokens/minute limit by itself. Cap content
        # much tighter for resumes; keep the larger cap for genuinely long
        # documents/projects that need more context.
        content_cap = 6000 if req.category == "resume" else 15000
        stripped_content = req.content.strip()
        content_len = len(stripped_content)
 
        # Deterministic, provider-agnostic sparse-resume note. This is a
        # plain Python character count, not an AI guess - so it's exactly as
        # reliable whether Gemini, Groq, or Ollama answers the request. It
        # gives the model a concrete number instead of letting it "eyeball"
        # sparseness from section labels alone (which was producing
        # generously-wrong formatting scores whenever the vision check was
        # unavailable, e.g. Gemini's daily quota being exhausted).
        sparse_note = ""
        is_sparse_resume = req.category == "resume" and content_len < SPARSE_RESUME_CHAR_THRESHOLD
        if is_sparse_resume:
            sparse_note = (
                f"\n\nIMPORTANT FACT (measured, not a guess): the extracted text of this resume is only "
                f"{content_len} characters long. A normal, reasonably filled one-page resume runs "
                f"1500-3000+ characters. This resume is far below that, which means the actual printed page "
                f"is almost certainly mostly BLANK/unused white space with only a few lines of text on it, "
                f"regardless of how many section labels ('Experience:', 'Skills:', etc.) appear in that short "
                f"text. You MUST explicitly call this out: mention the near-empty page / heavy unused "
                f"whitespace as one of the weaknesses in concrete terms (e.g. roughly what fraction of the "
                f"page is likely blank), and set 'formatting' no higher than 30 unless you have a specific "
                f"reason not to."
            )
 
        full_prompt = (
            f"Today's real-world date is {today_str}. Use this to correctly judge whether any dates "
            f"mentioned (internships, education, certifications) are in the past (already completed) or "
            f"future (upcoming/planned) - do not assume based on your training data, use the date given here."
            f"{sparse_note}\n\n"
            f"{prompt}\n\nDocument Text:\n{stripped_content[:content_cap]}"
        )
 
        LARGE_SCHEMA_CATEGORIES = {"resume", "project"}
        gen_options = {"max_output_tokens": 6144} if req.category in LARGE_SCHEMA_CATEGORIES else None
 
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
        print(f"[deep_analyze] category={req.category}, file_path={req.file_path}, needs_vision={needs_vision}, content_len={content_len}, is_sparse_resume={is_sparse_resume}")
 
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
                candidate = clean_text[start:end + 1]
                try:
                    data = json.loads(candidate)
                except json.JSONDecodeError:
                    # Trailing commas before a closing } or ] are the single
                    # most common syntax mistake non-Gemini models (Groq/
                    # Llama especially) make in generated JSON - plain
                    # json.loads() has zero tolerance for them, so strip them
                    # before giving up.
                    import re as _re
                    repaired = _re.sub(r",\s*([}\]])", r"\1", candidate)
                    data = json.loads(repaired)
 
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
            elif is_sparse_resume:
                # Deterministic safety net: the vision check either wasn't
                # run or failed (e.g. Gemini's daily quota exhausted), AND
                # the extracted text is measurably too short for a real
                # resume. Don't just hope the LLM honored the prompt note -
                # enforce it here in code so this is correct no matter which
                # provider answered or whether it followed instructions.
                if "atsScores" in data and isinstance(data["atsScores"].get("formatting"), (int, float)):
                    data["atsScores"]["formatting"] = min(int(data["atsScores"]["formatting"]), 30)
                data.setdefault("weaknesses", [])
                already_flagged = any("blank" in w.lower() or "empty" in w.lower() or "whitespace" in w.lower() for w in data["weaknesses"])
                if not already_flagged:
                    data["weaknesses"] = [
                        f"Formatting: The resume's extracted text is only {content_len} characters - "
                        f"far below what a normal filled one-page resume contains, meaning the printed page "
                        f"is almost entirely blank/unused white space with just a few lines of content."
                    ] + list(data["weaknesses"])
 
            return {"success": True, "analysis": data}
        except Exception as e:
            return {"success": False, "error": "Failed to parse JSON", "raw": response_text}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
 