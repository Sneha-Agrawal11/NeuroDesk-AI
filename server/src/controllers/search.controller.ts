import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { config } from '../config';
import { searchFts } from '../utils/fts';
import { displayCategory } from './workspace.controller';
 
const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;
 
const GENERIC_STOPWORDS = new Set([
  'find', 'my', 'get', 'show', 'me', 'the', 'a', 'an', 'for', 'search',
  'where', 'is', 'document', 'file', 'files', 'all', 'of', 'in', 'to', 'and'
]);
 
// Words that describe FORMAT rather than actual content - "resume pdf" means
// "a resume, and it should be a pdf", not "content containing the word pdf".
const FORMAT_HINTS: Record<string, string[]> = {
  '.pdf': ['pdf'],
  '.pptx': ['ppt', 'pptx', 'presentation', 'slide', 'slides'],
  '.docx': ['doc', 'docx', 'word'],
  '.xlsx': ['xlsx', 'xls', 'excel', 'spreadsheet'],
  '.csv': ['csv'],
  '.png': ['png', 'image', 'photo', 'picture', 'screenshot'],
  '.jpg': ['jpg', 'jpeg', 'image', 'photo', 'picture', 'screenshot'],
  '.txt': ['txt', 'text'],
  '.md': ['md', 'markdown'],
};
 
const CATEGORY_INTENT_KEYWORDS: Record<string, string[]> = {
  resume: ['resume', 'cv', 'curriculum vitae', 'bio-data', 'biodata'],
  certificate: ['certificate', 'certification', 'degree', 'marksheet'],
  research_paper: ['research paper', 'research', 'publication', 'thesis', 'paper'],
  code: ['source code', 'script', 'project', 'ipynb', 'code'],
  presentation: ['ppt', 'presentation', 'slide', 'slides'],
  spreadsheet: ['spreadsheet', 'excel', 'xlsx', 'csv'],
  image: ['photo', 'screenshot', 'picture', 'image'],
};
 
function detectCategoryIntent(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_INTENT_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return null;
}
 
function detectFormatExtensions(query: string): string[] {
  const lower = query.toLowerCase();
  const matched: string[] = [];
  for (const [ext, words] of Object.entries(FORMAT_HINTS)) {
    if (words.some(w => new RegExp(`\\b${w}\\b`).test(lower))) matched.push(ext);
  }
  return matched;
}
 
/** Does this file's extracted text actually carry meaningful content, or is it
 * just an error placeholder / empty? Used to stop garbage embeddings (e.g. an
 * image whose OCR+vision both failed) from polluting semantic-search ranking. */
function hasUsableText(extractedText: string | null | undefined): boolean {
  if (!extractedText) return false;
  const t = extractedText.trim();
  if (t.length < 20) return false;
  const looksLikeOnlyError = /^\[(OCR|Vision) Error/i.test(t) &&
    !/Scene Description:/i.test(t) && !/OCR Text:\n.+/i.test(t);
  return !looksLikeOnlyError;
}
 
export class SearchController {
 
  static async search(req: AuthRequest, res: Response) {
    try {
      const { query, mode = 'hybrid', limit = 20, filters } = req.body;
 
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query is required' });
      }
 
      logger.info(`Search request: "${query}", mode: ${mode}`);
 
      const contentTerms = (query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [])
        .filter((t: string) => !GENERIC_STOPWORDS.has(t) && t.length > 1 &&
          !Object.values(FORMAT_HINTS).some(words => words.includes(t)));
 
      const intentCategory = detectCategoryIntent(query);
      const formatExtensions = detectFormatExtensions(query);
 
      let ftsResults: any[] = [];
      let semanticResults: any[] = [];
 
      if (mode === 'hybrid' || mode === 'keyword') {
        try {
          ftsResults = await searchFts(query, limit * 3);
        } catch (ftsErr: any) {
          logger.warn(`FTS Search Warning: ${ftsErr.message}`);
        }
      }
 
      if (mode === 'hybrid' || mode === 'semantic') {
        try {
          const response = await axios.post(`${AI_SERVICE_URL}/internal/embed/search`, {
            query,
            limit: limit * 3,
            filters
          });
          if (response.data?.success) {
            semanticResults = response.data.results || [];
          }
        } catch (err: any) {
          logger.warn(`Semantic search failed: ${err.message}`);
        }
      }
 
      // Gather every candidate file id from every source, plus a broad net of
      // files whose filename contains any query term (catches files neither
      // FTS nor semantic search surfaced, e.g. never-indexed-for-content names).
      const ftsRankById = new Map<string, number>();
      ftsResults.forEach((r, i) => ftsRankById.set(r.file_id, i));
 
      const semanticScoreById = new Map<string, number>();
      semanticResults.forEach((r, i) => {
        const fileId = r?.metadata?.file_id;
        if (fileId && !semanticScoreById.has(fileId)) {
          semanticScoreById.set(fileId, 1 / (i + 1)); // 1.0 for rank 0, 0.5 rank 1, ...
        }
      });
 
      const candidateIds = new Set<string>([...ftsRankById.keys(), ...semanticScoreById.keys()]);
 
      if (contentTerms.length) {
        const filenameCandidates = await prisma.fileRecord.findMany({
          where: { OR: contentTerms.map((t: string) => ({ filename: { contains: t } })) },
          select: { id: true },
          take: limit * 3,
        });
        filenameCandidates.forEach(f => candidateIds.add(f.id));
      }
 
      if (intentCategory) {
        const categoryCandidates = await prisma.fileRecord.findMany({
          where: { OR: [{ category: intentCategory }, { aiCategory: intentCategory }] },
          select: { id: true },
          take: limit * 3,
        });
        categoryCandidates.forEach(f => candidateIds.add(f.id));
      }
 
      // Zero-result safety net: broad LIKE fallback so the user never sees a
      // blank page just because FTS/semantic both missed.
      if (candidateIds.size === 0) {
        const fallbackTerm = contentTerms.join(' ') || query;
        const fallbackFiles = await prisma.fileRecord.findMany({
          where: {
            OR: [
              { filename: { contains: fallbackTerm } },
              { extractedText: { contains: fallbackTerm } }
            ]
          },
          take: limit,
          orderBy: { fileModifiedAt: 'desc' }
        });
        fallbackFiles.forEach(f => candidateIds.add(f.id));
      }
 
      if (candidateIds.size === 0) {
        return res.json({ success: true, data: [] });
      }
 
      const files = await prisma.fileRecord.findMany({
        where: { id: { in: Array.from(candidateIds) } },
        include: { project: true }
      });
 
      // ---- Composite scoring ----
      // Filename relevance and category/format intent dominate; FTS and
      // semantic signals contribute but can't single-handedly outrank a
      // filename that plainly matches what the user asked for.
      const scored = files.map(file => {
        const filenameLower = file.filename.toLowerCase();
        let score = 0;
 
        if (contentTerms.length) {
          const matchedTerms = contentTerms.filter((t: string) => filenameLower.includes(t));
          score += (matchedTerms.length / contentTerms.length) * 100;
 
          const phrase = contentTerms.join(' ');
          if (phrase.length > 2 && filenameLower.includes(phrase)) score += 50;
        }
 
        const effectiveCategory = file.aiCategory || file.category;
        if (intentCategory && effectiveCategory === intentCategory) score += 45;
 
        if (formatExtensions.length) {
          const ext = ('.' + (file.extension || '').replace(/^\./, '')).toLowerCase();
          if (formatExtensions.includes(ext)) score += 35;
        }
 
        const ftsRank = ftsRankById.get(file.id);
        if (ftsRank !== undefined) score += (30 / (ftsRank + 1));
 
        const semScore = semanticScoreById.get(file.id);
        if (semScore !== undefined && hasUsableText(file.extractedText)) {
          score += semScore * 20;
        }
 
        // Tiny recency tiebreaker so ties favour the more recently touched file
        const recencyBonus = file.fileModifiedAt
          ? Math.min(5, (file.fileModifiedAt.getTime() / 1e13))
          : 0;
        score += recencyBonus;
 
        return { file, score };
      });
 
      scored.sort((a, b) => b.score - a.score);
      const hydratedResults = scored.slice(0, limit).map(s => s.file);
 
      // Attach snippets
      const resultsWithContext = hydratedResults.map(file => {
        const semanticMatch = semanticResults.find(r => r?.metadata?.file_id === file?.id);
        return {
          ...file,
          category: displayCategory(file!.filename, (file as any).aiCategory || file!.category),
          snippet: semanticMatch ? semanticMatch.content : (file?.extractedText ? `${file.extractedText.substring(0, 200)}...` : '')
        };
      });
 
      return res.json({ success: true, data: resultsWithContext });
 
    } catch (error: any) {
      logger.error(`Search error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Search failed' });
    }
  }
}