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

export class SearchController {
  
  static async search(req: AuthRequest, res: Response) {
    try {
      const { query, mode = 'hybrid', limit = 20, filters } = req.body;
      const userId = req.user!.userId;
      
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query is required' });
      }

      logger.info(`Search request: "${query}", mode: ${mode}`);

      let ftsResults: any[] = [];
      let semanticResults: any[] = [];

      // 1. Keyword Search (FTS5)
      if (mode === 'hybrid' || mode === 'keyword') {
        ftsResults = await searchFts(query, limit);
      }

      // 2. Semantic Search (ChromaDB)
      if (mode === 'hybrid' || mode === 'semantic') {
        try {
          const response = await axios.post(`${AI_SERVICE_URL}/internal/embed/search`, {
            query,
            limit,
            filters
          });
          if (response.data.success) {
            semanticResults = response.data.results;
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
      finalFileIds = [...new Set(finalFileIds)];

      // 4. Hydrate Results from DB
      if (finalFileIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const files = await prisma.fileRecord.findMany({
        where: { id: { in: finalFileIds } },
        include: { project: true }
      });

      // Maintain ranking order
      const hydratedResults = finalFileIds
        .map(id => files.find(f => f.id === id))
        .filter(Boolean);

      // Attach snippets if available from semantic search
      const resultsWithContext = hydratedResults.map(file => {
        const semanticMatch = semanticResults.find(r => r.metadata.file_id === file?.id);
        return {
          ...file,
          snippet: semanticMatch ? semanticMatch.content : (file?.extractedText ? `${file.extractedText.substring(0, 200)}...` : '')
        };
      });

      // Note: We should ideally log the search in FileAccessLog or similar for ML cache
      
      return res.json({ success: true, data: resultsWithContext });
      
    } catch (error: any) {
      logger.error(`Search error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Search failed' });
    }
  }
}
