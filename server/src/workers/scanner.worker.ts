import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { isExcluded } from '../utils/exclusions';
import { calculateFileHash } from '../utils/hash';
import { detectProject } from '../utils/projectDetector';
import { indexQueue } from './queue';

const prisma = new PrismaClient();

const getCategory = (ext: string | null, mimeType: string | null): string => {
  if (!ext && !mimeType) return 'document';
  
  if (['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'].includes(ext || '')) return 'document';
  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext || '')) return 'image';
  if (['.js', '.ts', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.tsx', '.jsx', '.html', '.css'].includes(ext || '')) return 'code';
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext || '')) return 'config';
  if (['.csv', '.xlsx', '.xls', '.tsv'].includes(ext || '')) return 'spreadsheet';
  if (['.pptx', '.ppt', '.key'].includes(ext || '')) return 'presentation';
  
  return 'document';
};

export const processScanJob = async (job: any) => {
  const { workspaceId, jobId } = job;
  
  logger.info(`Starting scan job ${jobId} for workspace ${workspaceId}`);
  
  try {
    // Update job status
    await prisma.scanJob.update({
      where: { id: jobId },
      data: { status: 'scanning', startedAt: new Date() }
    });
    
    // Get permitted folders
    const permissions = await prisma.permission.findMany({
      where: { workspaceId, enabled: true }
    });
    
    let filesFound = 0;
    let filesProcessed = 0;
    
    for (const perm of permissions) {
      if (fs.existsSync(perm.path)) {
        await scanDirectory(perm.path, workspaceId, async (stats) => {
          filesFound = stats.found;
          filesProcessed = stats.processed;
          
          // Periodically update job progress in DB (or via WebSocket)
          if (filesProcessed % 100 === 0) {
            await prisma.scanJob.update({
              where: { id: jobId },
              data: { filesFound, filesProcessed }
            });
            logger.info(`Scan progress: ${filesProcessed} files processed`);
          }
        });
      }
    }
    
    // Mark job as complete
    await prisma.scanJob.update({
      where: { id: jobId },
      data: { 
        status: 'complete', 
        completedAt: new Date(),
        filesFound,
        filesProcessed
      }
    });
    
    // Update workspace
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { 
        lastScanAt: new Date(),
        status: 'ready'
      }
    });
    
    logger.info(`Scan job ${jobId} complete. Processed ${filesProcessed} files.`);
    return { success: true, filesProcessed };
    
  } catch (error: any) {
    logger.error(`Scan job ${jobId} failed: ${error.message}`);
    
    await prisma.scanJob.update({
      where: { id: jobId },
      data: { 
        status: 'error', 
        errorMessage: error.message,
        completedAt: new Date() 
      }
    });
    
    throw error;
  }
};

async function scanDirectory(
  dirPath: string, 
  workspaceId: string, 
  onProgress: (stats: { found: number, processed: number }) => Promise<void>
) {
  let found = 0;
  let processed = 0;
  
  const scan = async (currentPath: string, projectId: string | null = null) => {
    if (isExcluded(currentPath)) return;
    
    try {
      const stat = fs.statSync(currentPath);
      
      if (stat.isDirectory()) {
        // Check if this directory is a project
        let currentProjectId = projectId;
        
        if (!projectId) {
          const projectInfo = detectProject(currentPath);
          if (projectInfo.isProject) {
            const project = await prisma.project.upsert({
              where: { path: currentPath },
              update: { lastCommitAt: stat.mtime },
              create: {
                name: projectInfo.name || path.basename(currentPath),
                path: currentPath,
                projectType: projectInfo.type,
              }
            });
            currentProjectId = project.id;
          }
        }
        
        const items = fs.readdirSync(currentPath);
        for (const item of items) {
          await scan(path.join(currentPath, item), currentProjectId);
        }
      } else if (stat.isFile()) {
        found++;
        
        const ext = path.extname(currentPath).toLowerCase();
        const mimeType = mime.lookup(currentPath) || null;
        
        // Quick check if file exists and mtime hasn't changed
        const existing = await prisma.fileRecord.findUnique({
          where: { path: currentPath },
          select: { fileModifiedAt: true, contentHash: true }
        });
        
        let shouldProcess = true;
        let contentHash = existing?.contentHash || null;
        
        if (existing && existing.fileModifiedAt.getTime() === stat.mtime.getTime()) {
          shouldProcess = false; // Unchanged based on mtime
        }
        
        if (shouldProcess) {
          contentHash = await calculateFileHash(currentPath);
          
          if (existing && existing.contentHash === contentHash) {
             // File touched but content is same
             await prisma.fileRecord.update({
               where: { path: currentPath },
               data: { fileModifiedAt: stat.mtime }
             });
          } else {
             // New or modified content
             const record = await prisma.fileRecord.upsert({
               where: { path: currentPath },
               update: {
                 sizeBytes: stat.size,
                 contentHash,
                 fileModifiedAt: stat.mtime,
                 status: 'discovered',
                 projectId
               },
               create: {
                 path: currentPath,
                 filename: path.basename(currentPath),
                 extension: ext,
                 mimeType,
                 category: getCategory(ext, mimeType),
                 sizeBytes: stat.size,
                 contentHash,
                 fileModifiedAt: stat.mtime,
                 status: 'discovered',
                 projectId
               }
             });
             
             // Trigger index job for this file
             indexQueue.push({ fileId: record.id });
          }
        }

        
        processed++;
        if (processed % 50 === 0) {
          await onProgress({ found, processed });
        }
      }
    } catch (err) {
      logger.warn(`Failed to scan ${currentPath}: ${err}`);
    }
  };
  
  await scan(dirPath);
  await onProgress({ found, processed });
}
