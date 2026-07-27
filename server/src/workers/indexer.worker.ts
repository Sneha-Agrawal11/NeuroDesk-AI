import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { indexFileInFts } from '../utils/fts';
import { mlQueue } from './queue';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;

export const processIndexJob = async (job: any) => {
  const { fileId } = job;
  
  logger.info(`Starting indexing job for file ${fileId}`);
  
  try {
    const fileRecord = await prisma.fileRecord.findUnique({
      where: { id: fileId }
    });
    
    if (!fileRecord) {
      throw new Error(`File ${fileId} not found in database`);
    }

    // Update status
    await prisma.fileRecord.update({
      where: { id: fileId },
      data: { status: 'extracting' }
    });

    // 1. Send to AI Service for parsing
    let parsedText = '';
    let chunks: string[] = [];
    
    try {
      const ext = fileRecord.extension ? fileRecord.extension.replace('.', '') : 'txt';
      const parseResponse = await axios.post(`${AI_SERVICE_URL}/internal/parse`, {
        file_path: fileRecord.path,
        file_type: ext
      });
      
      if (!parseResponse.data?.success || !parseResponse.data.text?.trim()) {
        throw new Error('Parser returned no extractable text');
      }
      parsedText = parseResponse.data.text;
      chunks = parseResponse.data.chunks || [];
    } catch (parseError: any) {
      logger.warn(`Failed to parse ${fileRecord.path} via AI service: ${parseError.message}. Storing as unindexed.`);
      parsedText = '';
    }

    // 2. Index in SQLite FTS
    if (parsedText) {
      await indexFileInFts(fileId, fileRecord.filename, parsedText, fileRecord.category);
    }
    
    // 3. Save chunks and send to ChromaDB for embedding.  Chroma is authoritative
    // for semantic retrieval, so do not mark a file indexed until its upsert succeeds.
    if (chunks.length === 0) {
      throw new Error('No chunks were generated from extracted text');
    }
    {
        const chunkModels = chunks.map((content, index) => ({
        chunk_index: index,
        content: content,
        category: fileRecord.category,
        project_id: fileRecord.projectId || '',
        filename: fileRecord.filename
      }));

      let offset = 0;
      await prisma.chunk.deleteMany({
        where: { fileId }
      });

      await prisma.chunk.createMany({
        data: chunkModels.map((chunk, index) => {
          const tokenCount = chunk.content.split(/\s+/).filter(Boolean).length;
          const startOffset = offset;
          offset += chunk.content.length;

          return {
            fileId,
            chunkIndex: index,
            content: chunk.content,
            chromaId: `${fileId}_${index}`,
            startOffset,
            endOffset: offset,
            tokenCount,
          };
        })
      });

      // Store in our relational DB (optional, but good for linking)
      // For large files, we might skip this to save DB size, or only store metadata
      
      // Send to ChromaDB
      const embedResponse = await axios.post(`${AI_SERVICE_URL}/internal/embed/batch`, {
        file_id: fileId,
        chunks: chunkModels
      });
      if (!embedResponse.data?.success) throw new Error('Embedding service did not confirm chunk storage');
    }

    // Update status to indexed
    await prisma.fileRecord.update({
      where: { id: fileId },
      data: { 
        status: 'indexed',
        extractedText: parsedText ? parsedText.substring(0, 5000) : null, // preview
        indexedAt: new Date()
      }
    });

    // 4. Trigger ML & Graph Extraction
    mlQueue.push({ fileId });

    logger.info(`Successfully indexed file ${fileId}`);
    return { success: true };
    
  } catch (error: any) {
    logger.error(`Indexing job ${fileId} failed: ${error.message}`);
    
    await prisma.fileRecord.update({
      where: { id: fileId },
      data: { 
        status: 'error',
        errorMessage: error.message
      }
    });
    
    throw error;
  }
};
