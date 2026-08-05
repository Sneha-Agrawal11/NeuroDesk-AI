import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
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

    // Update status to extracting
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
      
      if (parseResponse.data?.success && parseResponse.data.text?.trim()) {
        parsedText = parseResponse.data.text;
        chunks = parseResponse.data.chunks || [];
      } else {
        logger.warn(`AI Parser returned empty text for ${fileRecord.filename}`);
      }
    } catch (parseError: any) {
      logger.warn(`Failed to parse ${fileRecord.path} via AI service: ${parseError.message}`);
    }

    // Fallback Text Generation: If AI parser returned empty, extract basic raw file text or filename info
    if (!parsedText || !parsedText.trim()) {
      try {
        if (fs.existsSync(fileRecord.path)) {
          const rawBuffer = fs.readFileSync(fileRecord.path);
          // Simple UTF-8 text fallback for text/code files
          const rawStr = rawBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
          if (rawStr.trim().length > 20) {
            parsedText = rawStr;
          }
        }
      } catch (e) {
        // Fallback silently if unreadable binary
      }

      // Safe default fallback content so chunks/embeddings never crash
      if (!parsedText || !parsedText.trim()) {
        parsedText = `Document: ${fileRecord.filename}\nType: ${fileRecord.category || 'file'}\nExtension: ${fileRecord.extension}\nPath: ${fileRecord.path}`;
      }
    }

    // Ensure chunks exist if AI service didn't generate them
    if (chunks.length === 0) {
      // Chunk text into ~500 word blocks safely
      const words = parsedText.split(/\s+/);
      const chunkSize = 500;
      for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
      }
    }

    // 2. Index in SQLite FTS
    if (parsedText) {
      try {
        await indexFileInFts(fileId, fileRecord.filename, parsedText, fileRecord.category);
      } catch (ftsError: any) {
        logger.warn(`FTS indexing warning for ${fileId}: ${ftsError.message}`);
      }
    }
    
    // 3. Save chunks into DB & Sync with Vector/Embedding Service
    const chunkModels = chunks.map((content, index) => ({
      chunk_index: index,
      content: content,
      category: fileRecord.category || 'document',
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

    // Send to ChromaDB Embedding Service
    try {
      const embedResponse = await axios.post(`${AI_SERVICE_URL}/internal/embed/batch`, {
        file_id: fileId,
        chunks: chunkModels
      });
      if (!embedResponse.data?.success) {
        logger.warn(`Vector embedding service did not confirm batch storage for ${fileId}`);
      }
    } catch (embedErr: any) {
      logger.warn(`Embedding batch request failed: ${embedErr.message}. File will still remain searchable locally.`);
    }

    // Update status to indexed with full extractedText stored (up to 20,000 characters)
    await prisma.fileRecord.update({
      where: { id: fileId },
      data: { 
        status: 'indexed',
        extractedText: parsedText ? parsedText.substring(0, 20000) : null,
        indexedAt: new Date(),
        errorMessage: null
      }
    });

    // 4. ML Classification & Graph Extraction now happens lazily on document open
    // via the getDocumentAnalysis endpoint, avoiding wasteful bulk AI calls.

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