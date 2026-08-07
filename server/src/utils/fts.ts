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

// Words that describe a file FORMAT/TYPE rather than actual content. When a
// user says "resume pdf" or "infosys template ppt", the word "pdf"/"ppt" will
// never literally appear inside a .pptx's extracted text - so requiring it as
// an FTS content term (AND-ed with the real keywords) made the whole query
// fail to match the file the user actually wanted. These are extracted out
// and used as a ranking/category signal instead (see search.controller.ts).
const FORMAT_STOPWORDS = new Set([
  'pdf', 'ppt', 'pptx', 'ppts', 'doc', 'docx', 'docs', 'xls', 'xlsx', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md',
]);

export const searchFts = async (query: string, limit: number = 20) => {
  try {
    await ensureFtsReady();

    // Strip common stop-words so "find my resume pdf" becomes ["resume"]
    const stopWords = new Set(['find', 'my', 'get', 'show', 'me', 'the', 'a', 'an', 'for', 'search', 'where', 'is', 'document', 'file', 'files', 'all', 'of', 'in', 'to']);
    const terms = (query.match(/[\p{L}\p{N}_-]+/gu) || [])
      .filter(t => !stopWords.has(t.toLowerCase()) && !FORMAT_STOPWORDS.has(t.toLowerCase()) && t.length > 1);
    if (!terms.length) return [];

    // Use AND logic first (all real content terms must appear), but fall
    // back to OR if that's too strict and returns nothing - a partial match
    // ranked lower is far more useful than zero results.
    const buildQuery = (op: 'AND' | 'OR') =>
      terms.map(term => `"${term.replace(/"/g, '')}"*`).join(` ${op} `);

    // BM25 column weights: file_id(0), filename(10), content(1), category(5)
    // Filename matches are weighted 10x higher than content matches so a file
    // literally named "resume" outranks one that merely mentions the word.
    const runQuery = async (matchQuery: string) => prisma.$queryRawUnsafe<any[]>(
      `SELECT file_id, filename, category,
              snippet(file_search, 2, '<b>', '</b>', '...', 30) AS snippet,
              bm25(file_search, 0.0, 10.0, 1.0, 5.0) AS rank
       FROM file_search
       WHERE file_search MATCH ?
       ORDER BY rank LIMIT ?`,
      matchQuery, limit
    );

    let results = await runQuery(buildQuery('AND'));
    if (!results.length && terms.length > 1) {
      results = await runQuery(buildQuery('OR'));
    }

    return results;
  } catch (error) {
    logger.error(`FTS search failed for query "${query}": ${error}`);
    return [];
  }
};
