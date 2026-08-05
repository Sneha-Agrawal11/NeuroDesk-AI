import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient();
let ftsReady: Promise<void> | null = null;

const ensureFtsReady = () => {
  if (!ftsReady) {
    ftsReady = setupFtsTable();
  }

  return ftsReady;
};

export const setupFtsTable = async () => {
  try {
    // Check if the FTS table exists, create if not
    // Prisma does not natively support SQLite FTS5, so we use raw queries
    
    await prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_search USING fts5(
        file_id UNINDEXED,
        filename,
        content,
        category,
        tokenize='porter unicode61'
      );
    `);
    
    logger.info('SQLite FTS5 virtual table ready.');
  } catch (error) {
    logger.error(`Failed to setup FTS5 table: ${error}`);
  }
};

export const indexFileInFts = async (fileId: string, filename: string, content: string, category: string) => {
  try {
    await ensureFtsReady();

    // Upsert equivalent: Delete old entry, insert new
    await prisma.$executeRawUnsafe(`DELETE FROM file_search WHERE file_id = ?`, fileId);
    
    // Insert new entry
    await prisma.$executeRawUnsafe(
      `INSERT INTO file_search(file_id, filename, content, category) VALUES(?, ?, ?, ?)`,
      fileId, filename, content, category
    );
  } catch (error) {
    logger.error(`Failed to index file ${fileId} in FTS: ${error}`);
  }
};

export const removeFileFromFts = async (fileId: string) => {
  try {
    await ensureFtsReady();
    await prisma.$executeRawUnsafe(`DELETE FROM file_search WHERE file_id = ?`, fileId);
  } catch (error) {
    logger.error(`Failed to remove file ${fileId} from FTS: ${error}`);
  }
};

export const searchFts = async (query: string, limit: number = 20) => {
  try {
    await ensureFtsReady();

    // Strip common stop-words so "find my resume pdf" becomes ["resume", "pdf"]
    const stopWords = new Set(['find', 'my', 'get', 'show', 'me', 'the', 'a', 'an', 'for', 'search', 'where', 'is', 'document', 'file', 'files', 'all', 'of', 'in', 'to']);
    const terms = (query.match(/[\p{L}\p{N}_-]+/gu) || [])
      .filter(t => !stopWords.has(t.toLowerCase()) && t.length > 1);
    if (!terms.length) return [];

    // Use AND logic: ALL terms must appear (as prefix matches) in the row.
    // This prevents "resume OR pdf" from returning every PDF in the workspace.
    const safeQuery = terms.map(term => `"${term.replace(/"/g, '')}"*`).join(' AND ');

    // BM25 column weights: file_id(0), filename(10), content(1), category(5)
    // Filename matches are weighted 10x higher than content matches so a file
    // literally named "resume" outranks one that merely mentions the word.
    const results = await prisma.$queryRawUnsafe<any[]>(
      `SELECT file_id, filename, category,
              snippet(file_search, 2, '<b>', '</b>', '...', 30) AS snippet,
              bm25(file_search, 0.0, 10.0, 1.0, 5.0) AS rank
       FROM file_search
       WHERE file_search MATCH ?
       ORDER BY rank LIMIT ?`,
      safeQuery, limit
    );

    return results;
  } catch (error) {
    logger.error(`FTS search failed for query "${query}": ${error}`);
    return [];
  }
};
