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

export const searchFts = async (query: string, limit: number = 20) => {
  try {
    await ensureFtsReady();

    // Basic FTS match
    // Note: User input should be sanitized to avoid malformed MATCH queries
    const safeQuery = query.replace(/["']/g, ''); 
    const results = await prisma.$queryRawUnsafe<any[]>(
      `SELECT file_id, filename, category, bm25(file_search) AS rank 
       FROM file_search 
       WHERE file_search MATCH ? 
       ORDER BY rank LIMIT ?`,
      `"${safeQuery}"* OR ${safeQuery}`, limit
    );
    
    return results;
  } catch (error) {
    logger.error(`FTS search failed for query "${query}": ${error}`);
    return [];
  }
};
