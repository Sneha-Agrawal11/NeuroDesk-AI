import Queue from 'better-queue';
import { logger } from '../utils/logger';

export const scanQueue = new Queue((job: any, cb: any) => {
  // We'll require the worker dynamically to avoid circular dependencies
  import('./scanner.worker').then(({ processScanJob }) => {
    processScanJob(job)
      .then(result => cb(null, result))
      .catch(err => cb(err));
  });
}, {
  maxRetries: 3,
  retryDelay: 5000,
  concurrent: 1 // Only one scan at a time
});

export const indexQueue = new Queue((job: any, cb: any) => {
  import('./indexer.worker').then(({ processIndexJob }) => {
    processIndexJob(job)
      .then(result => cb(null, result))
      .catch(err => cb(err));
  });
}, {
  maxRetries: 5,
  retryDelay: 2000,
  concurrent: 3 // Parallel indexing
});

scanQueue.on('task_failed', (taskId: string, err: Error, stats: unknown) => {
  logger.error(`Scan task ${taskId} failed: ${err}`);
});

indexQueue.on('task_failed', (taskId: string, err: Error, stats: unknown) => {
  logger.error(`Index task ${taskId} failed: ${err}`);
});

export const mlQueue = new Queue((job: any, cb: any) => {
  import('./ml.worker').then(({ processMlJob }) => {
    processMlJob(job)
      .then(result => cb(null, result))
      .catch(err => cb(err));
  });
}, {
  maxRetries: 3,
  retryDelay: 5000,
  concurrent: 2 // Parallel ML processing
});

mlQueue.on('task_failed', (taskId: string, err: Error, stats: unknown) => {
  logger.error(`ML task ${taskId} failed: ${err}`);
});
