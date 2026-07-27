import chokidar from 'chokidar';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { isExcluded } from '../utils/exclusions';
import { scanQueue } from './queue';

const prisma = new PrismaClient();
const watchers: Record<string, chokidar.FSWatcher> = {};

export const setupWatchers = async () => {
  try {
    // Get all enabled permissions across all workspaces
    const permissions = await prisma.permission.findMany({
      where: { enabled: true },
      include: { workspace: true }
    });

    for (const perm of permissions) {
      if (!watchers[perm.path]) {
        logger.info(`Starting filesystem watcher for: ${perm.path}`);
        
        const watcher = chokidar.watch(perm.path, {
          ignored: (path: string) => isExcluded(path),
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
          }
        });

        watcher
          .on('add', path => handleFileEvent('add', path, perm.workspace.id))
          .on('change', path => handleFileEvent('change', path, perm.workspace.id))
          .on('unlink', path => handleFileEvent('unlink', path, perm.workspace.id))
          .on('error', error => logger.error(`Watcher error: ${error}`));

        watchers[perm.path] = watcher;
      }
    }
  } catch (error) {
    logger.error(`Failed to setup watchers: ${error}`);
  }
};

const handleFileEvent = async (event: 'add' | 'change' | 'unlink', filePath: string, workspaceId: string) => {
  logger.info(`File ${event} detected: ${filePath}`);
  
  // For unlinks, we can handle it immediately by marking status
  if (event === 'unlink') {
    try {
      await prisma.fileRecord.delete({
        where: { path: filePath }
      });
      // Optionally remove from chroma/tantivy via queues
    } catch (err) {
      logger.error(`Failed to delete record for unlinked file ${filePath}`);
    }
    return;
  }
  
  // For add/change, it's safer to queue a mini-scan job or just trigger a fast scan
  // For MVP, we'll queue a targeted scan job for the specific directory, or we can queue the file for indexing directly.
  
  // Queue the file for indexing directly
  try {
    const fs = require('fs');
    const path = require('path');
    const mime = require('mime-types');

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mime.lookup(filePath) || null;
    const stat = fs.statSync(filePath);

    const fileRecord = await prisma.fileRecord.upsert({
      where: { path: filePath },
      update: {
        sizeBytes: BigInt(stat.size),
        fileModifiedAt: stat.mtime,
        status: 'discovered'
      },
      create: {
        path: filePath,
        filename: path.basename(filePath),
        extension: ext,
        mimeType,
        category: ext === '.pdf' || ext === '.txt' || ext === '.md' ? 'document' : 'document',
        sizeBytes: BigInt(stat.size),
        fileModifiedAt: stat.mtime,
        status: 'discovered',
        projectId: null
      }
    });

    const { indexQueue } = await import('./queue');
    indexQueue.push({ fileId: fileRecord.id });
    logger.info(`Queued indexing for ${filePath}`);
  } catch (err) {
    logger.error(`Failed to handle file update for ${filePath}: ${err}`);
  }
};
