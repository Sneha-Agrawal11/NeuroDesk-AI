import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { config } from '../config';
import { searchFts } from '../utils/fts';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;

// Reciprocal Rank Fusion helper
const rrf = (ftsResults: any[], semanticResults: any[], k: number = 60) => {
  const scores = new Map<string, number>();
  
  // Score FTS
  ftsResults.forEach((result, index) => {
    scores.set(result.file_id, 1 / (k + index + 1));
  });
  
  // Score Semantic
  semanticResults.forEach((result, index) => {
    const fileId = result.metadata?.file_id;
    if (fileId) {
      const currentScore = scores.get(fileId) || 0;
      scores.set(fileId, currentScore + (1 / (k + index + 1)));
    }
  });
  
  // Sort by RRF score descending
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([fileId, score]) => ({ fileId, score }));
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

export class SearchController {
  
  static async search(req: AuthRequest, res: Response) {
    try {
      const { query, mode = 'hybrid', limit = 20, filters } = req.body;
      
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query is required' });
      }

      logger.info(`Search request: "${query}", mode: ${mode}`);

      let ftsResults: any[] = [];
      let semanticResults: any[] = [];

      // Extract search keywords (e.g. "find my resume" -> ["resume"])
      const rawKeywords = query.toLowerCase().replace(/find|my|show|get|the|file|doc|pdf/gi, '').trim();
      const searchTerm = rawKeywords.length > 1 ? rawKeywords : query;

      // Direct Database Filename Match (Crucial Fallback)
      const filenameMatches = await prisma.fileRecord.findMany({
        where: {
          OR: [
            { filename: { contains: searchTerm } },
            { filename: { contains: query } }
          ]
        },
        select: { id: true },
        take: limit
      });
      const filenameMatchIds = filenameMatches.map(f => f.id);

      // 1. Keyword Search (FTS5)
      if (mode === 'hybrid' || mode === 'keyword') {
        try {
          ftsResults = await searchFts(query, limit);
        } catch (ftsErr: any) {
          logger.warn(`FTS Search Warning: ${ftsErr.message}`);
        }
      }

      // 2. Semantic Search (ChromaDB)
      if (mode === 'hybrid' || mode === 'semantic') {
        try {
          const response = await axios.post(`${AI_SERVICE_URL}/internal/embed/search`, {
            query,
            limit,
            filters
          });
          if (response.data?.success) {
            semanticResults = response.data.results || [];
          }
        } catch (err: any) {
          logger.warn(`Semantic search failed: ${err.message}`);
        }
      }

      let finalFileIds: string[] = [];

      // 3. Fusion & Ranking
      if (mode === 'hybrid') {
        const fused = rrf(ftsResults, semanticResults);
        finalFileIds = fused.slice(0, limit).map(item => item.fileId);
      } else if (mode === 'keyword') {
        finalFileIds = ftsResults.map(r => r.file_id);
      } else if (mode === 'semantic') {
        finalFileIds = semanticResults.map(r => r.metadata?.file_id).filter(Boolean);
      }

      // Prioritize direct Filename Matches at top
      finalFileIds = [...new Set([...filenameMatchIds, ...finalFileIds])];

      // Guarantee category/intent matches
      const intentCategory = detectCategoryIntent(query);
      if (intentCategory) {
        const categoryMatches = await prisma.fileRecord.findMany({
          where: {
            OR: [
              { category: intentCategory },
              { filename: { contains: intentCategory } }
            ]
          },
          select: { id: true },
          orderBy: { fileModifiedAt: 'desc' },
          take: limit,
        });
        const categoryIds = categoryMatches.map(f => f.id);
        finalFileIds = [...new Set([...categoryIds, ...finalFileIds])];
      }

      // 4. Fallback: If nothing returned, search DB with LIKE
      if (finalFileIds.length === 0) {
        const fallbackFiles = await prisma.fileRecord.findMany({
          where: {
            OR: [
              { filename: { contains: searchTerm } },
              { extractedText: { contains: searchTerm } }
            ]
          },
          take: limit,
          orderBy: { fileModifiedAt: 'desc' }
        });
        finalFileIds = fallbackFiles.map(f => f.id);
      }

      if (finalFileIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // Fetch file details
      const files = await prisma.fileRecord.findMany({
        where: { id: { in: finalFileIds } },
        include: { project: true }
      });

      // Maintain ranking order
      let hydratedResults = finalFileIds
        .map(id => files.find(f => f.id === id))
        .filter(Boolean);

      // Boost direct filename / category matches to the very top
      if (intentCategory || searchTerm) {
        const matchKeyword = intentCategory || searchTerm;
        const exactMatches = hydratedResults.filter(f => 
          f?.filename.toLowerCase().includes(matchKeyword) || 
          f?.category === intentCategory
        );
        const rest = hydratedResults.filter(f => 
          !exactMatches.some(m => m?.id === f?.id)
        );
        hydratedResults = [...exactMatches, ...rest];
      }

      // Attach snippets
      const resultsWithContext = hydratedResults.map(file => {
        const semanticMatch = semanticResults.find(r => r?.metadata?.file_id === file?.id);
        return {
          ...file,
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