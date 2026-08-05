import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;

export const processMlJob = async (job: any) => {
  const { fileId } = job;
  
  logger.info(`Starting ML and Graph extraction job for file ${fileId}`);
  
  try {
    const fileRecord = await prisma.fileRecord.findUnique({
      where: { id: fileId },
      include: { project: true }
    });
    
    if (!fileRecord || !fileRecord.extractedText) {
      // Nothing to process if text wasn't extracted
      return { success: false, reason: 'No extracted text available' };
    }

    const textContent = fileRecord.extractedText;

    // 1. ML Classification and Summary
    let detectedCategory = fileRecord.category;
    try {
      const classRes = await axios.post(`${AI_SERVICE_URL}/internal/ml/classify`, {
        file_name: fileRecord.filename,
        content: textContent.substring(0, 5000) // Classify based on first 5K chars
      });
      
      if (classRes.data.success) {
        detectedCategory = classRes.data.classification.category;
        await prisma.fileRecord.update({
          where: { id: fileId },
          data: { aiCategory: detectedCategory }
        });
      }

      // Classification happens after the initial embed. Re-upsert the existing
      // chunks so Chroma metadata remains consistent with SQLite metadata.
      const chunks = await prisma.chunk.findMany({ where: { fileId }, orderBy: { chunkIndex: 'asc' } });
      if (chunks.length) {
        await axios.post(`${AI_SERVICE_URL}/internal/embed/batch`, {
          file_id: fileId,
          chunks: chunks.map(chunk => ({
            chunk_index: chunk.chunkIndex,
            content: chunk.content,
            category: detectedCategory,
            project_id: fileRecord.projectId || '',
            filename: fileRecord.filename
          }))
        });
      }
      
      // Note: full deep AI analysis (summary, ATS score, etc.) is intentionally
      // NOT run here. Background indexing stays lightweight - metadata,
      // embeddings, classification only - so bulk scans of hundreds/
      // thousands of files stay fast and don't hammer the AI provider's rate
      // limits. Full analysis runs on demand instead, the moment the user
      // opens a document (see getDocumentAnalysis), reusing the same pipeline.
    } catch (err: any) {
      logger.warn(`ML Classification failed for ${fileId}: ${err.message}`);
    }

    // 2. Knowledge Graph Extraction
    try {
      // We need all file names in the workspace to find references
      // In production, limit this to same project or recent files to save memory
      const allFiles = await prisma.fileRecord.findMany({
        select: { id: true, filename: true },
        take: 1000 // Limit for safety
      });
      
      const graphRes = await axios.post(`${AI_SERVICE_URL}/internal/graph/extract`, {
        file_name: fileRecord.filename,
        content: textContent,
        workspace_files: allFiles.map(f => ({ id: f.id, name: f.filename }))
      });
      
      if (graphRes.data.success) {
        const { technologies, relationships } = graphRes.data;
        
        // Save technologies as tags
        if (technologies.length > 0) {
           await prisma.fileRecord.update({
             where: { id: fileId },
             data: { aiTags: JSON.stringify(technologies) }
           });
        }
        
        // Save Relationships
        for (const rel of relationships) {
          await prisma.relationship.upsert({
            where: {
              sourceFileId_targetFileId_relationshipType: {
                sourceFileId: fileId,
                targetFileId: rel.target_id,
                relationshipType: rel.type
              }
            },
            update: { confidence: rel.confidence, context: rel.context },
            create: {
              sourceFileId: fileId,
              targetFileId: rel.target_id,
              relationshipType: rel.type,
              confidence: rel.confidence,
              context: rel.context
            }
          });
        }
      }
    } catch (err: any) {
      logger.warn(`Graph extraction failed for ${fileId}: ${err.message}`);
    }
    
    // Mark analyzed
    await prisma.fileRecord.update({
      where: { id: fileId },
      data: { 
        status: 'analyzed',
        lastAnalyzedAt: new Date()
      }
    });

    logger.info(`Successfully finished ML job for file ${fileId}`);
    return { success: true };
    
  } catch (error: any) {
    logger.error(`ML job ${fileId} failed: ${error.message}`);
    
    await prisma.fileRecord.update({
      where: { id: fileId },
      data: { status: 'error', errorMessage: `ML Error: ${error.message}` }
    });
    
    throw error;
  }
};
