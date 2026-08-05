import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mime from 'mime-types';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { scanQueue } from '../workers/queue';
import { indexQueue } from '../workers/queue';
import axios from 'axios';
import { config } from '../config';
import { calculateFileHash } from '../utils/hash';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;

// Files that are held back pending user confirmation because their content
// hash matches a document that's already in the workspace. Kept in memory
// only (no schema change) - cleared on cancel/confirm or server restart.
type PendingDuplicateUpload = {
  path: string;
  filename: string;
  extension: string;
  mimeType: string | null;
  size: number;
};
const pendingDuplicateUploads = new Map<string, PendingDuplicateUpload>();

export class WorkspaceController {

  static async createWorkspace(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;

      const workspace = await prisma.workspace.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          status: 'created'
        }
      });

      return res.json({ success: true, data: workspace });
    } catch (error: any) {
      logger.error(`Create workspace error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to create workspace' });
    }
  }

  static async getStatus(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;

      let workspace = await prisma.workspace.findUnique({
        where: { userId },
        include: {
          scanJobs: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!workspace) {
        workspace = await prisma.workspace.create({
          data: {
            userId,
            status: 'created'
          },
          include: {
            scanJobs: true
          }
        });
      }

      return res.json({ success: true, data: workspace });
    } catch (error: any) {
      logger.error(`Get workspace status error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to get workspace status' });
    }
  }

  static async triggerScan(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;

      const workspace = await prisma.workspace.findUnique({
        where: { userId }
      });

      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
      }

      // Update status to scanning
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { status: 'ready' }
      });

      // Create scan job
      const job = await prisma.scanJob.create({
        data: {
          workspaceId: workspace.id,
          status: 'queued'
        }
      });

      // Add to background queue
      scanQueue.push({ workspaceId: workspace.id, jobId: job.id });

      return res.json({ success: true, data: { jobId: job.id, message: 'Scan queued' } });
    } catch (error: any) {
      logger.error(`Trigger scan error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to trigger scan' });
    }
  }

  static async listProjects(req: AuthRequest, res: Response) {
    try {
      const projects = await prisma.project.findMany({
        orderBy: { discoveredAt: 'desc' },
        take: 24,
        include: {
          _count: {
            select: { files: true }
          }
        }
      });

      return res.json({
        success: true,
        data: projects.map(project => ({
          id: project.id,
          name: project.name,
          path: project.path,
          description: project.description,
          projectType: project.projectType,
          healthScore: project.healthScore,
          totalFiles: project.totalFiles,
          technologyStack: project.technologyStack,
          discoveredAt: project.discoveredAt,
          filesCount: project._count.files,
        }))
      });
    } catch (error: any) {
      logger.error(`List projects error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to list projects' });
    }
  }

  static async listDocuments(req: AuthRequest, res: Response) {
    try {
      const documents = await prisma.fileRecord.findMany({
        where: { projectId: null },
        orderBy: { fileModifiedAt: 'desc' },
        take: 50,
      });

      return res.json({
        success: true,
        data: documents.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          category: doc.aiCategory || doc.category,
          sizeBytes: doc.sizeBytes.toString(),
          tags: doc.aiTags ? JSON.parse(doc.aiTags) : [],
          summary: doc.aiSummary || doc.extractedText?.substring(0, 100) || '',
          status: doc.status,
          fileModifiedAt: doc.fileModifiedAt,
        }))
      });
    } catch (error: any) {
      logger.error(`List documents error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to list documents' });
    }
  }

  static async serveDocumentFile(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const fileRecord = await prisma.fileRecord.findUnique({ where: { id } });

      if (!fileRecord) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      if (!fs.existsSync(fileRecord.path)) {
        return res.status(404).json({ success: false, error: 'File no longer exists on disk' });
      }

      const mimeType = fileRecord.mimeType || mime.lookup(fileRecord.path) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileRecord.filename)}"`);
      // Override the global CSP for this response - it's already scoped to
      // just this route and the frontend origin via app.ts, but being
      // explicit here too since this endpoint is what gets framed.
      res.removeHeader('X-Frame-Options');

      const stream = fs.createReadStream(fileRecord.path);
      stream.on('error', (err) => {
        logger.error(`Failed to stream file ${fileRecord.path}: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Failed to read file' });
        }
      });
      stream.pipe(res);
    } catch (error: any) {
      logger.error(`Serve document file error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to serve file' });
    }
  }

  static async getDocumentAnalysis(req: AuthRequest, res: Response) {
    try {
      const fileId = String(req.params.id);
      const fileRecord = await prisma.fileRecord.findUnique({
        where: { id: fileId }
      });

      if (!fileRecord) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      if (!fileRecord.extractedText) {
        return res.status(409).json({ success: false, error: 'Document is still being indexed or has no extractable text' });
      }

      const cacheKey = `analysis:${fileRecord.id}:${fileRecord.contentHash || fileRecord.indexedAt?.getTime() || 'current'}`;
      const cached = await prisma.aICache.findUnique({ where: { cacheKey } });
      if (cached) {
        return res.json({ success: true, data: JSON.parse(cached.value) });
      }

      // Call AI service for deep analysis
      try {
        const response = await axios.post(`${AI_SERVICE_URL}/internal/ml/deep_analyze`, {
          content: fileRecord.extractedText,
          category: fileRecord.aiCategory || fileRecord.category,
          filename: fileRecord.filename
        });

        if (response.data && response.data.success) {
          await prisma.aICache.upsert({
            where: { cacheKey },
            update: { value: JSON.stringify(response.data.analysis), contentHash: fileRecord.contentHash || '' },
            create: { cacheType: 'analysis', cacheKey, value: JSON.stringify(response.data.analysis), contentHash: fileRecord.contentHash || '' }
          });
          await prisma.fileRecord.update({ where: { id: fileRecord.id }, data: { lastAnalyzedAt: new Date() } });
          return res.json({ success: true, data: response.data.analysis });
        }
      } catch (analyzeErr: any) {
        logger.warn(`Deep analyze failed for ${fileRecord.id}, falling back to extracted text: ${analyzeErr.message}`);
      }

      // AI analysis didn't come back (provider error, rate limit, etc.) -
      // never leave the page blank. Fall back to a plain-text preview built
      // from what was already parsed and indexed, clearly labelled so the
      // user knows this isn't the full AI analysis.
      const fallbackSummary = fileRecord.extractedText.slice(0, 800);
      return res.json({
        success: true,
        data: {
          summary: fallbackSummary,
          aiUnavailable: true,
        }
      });

    } catch (error: any) {
      logger.error(`Document analysis error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to analyze document' });
    }
  }

  static async getProjectAnalysis(req: AuthRequest, res: Response) {
    try {
      const projectId = String(req.params.id);
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { files: { select: { path: true, filename: true, category: true, extension: true, extractedText: true } } }
      });

      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      const cacheKey = `project-analysis:${project.id}:${project.analyzedAt?.getTime() || project.files.map(file => file.path).join('|')}`;
      const cached = await prisma.aICache.findUnique({ where: { cacheKey } });
      if (cached) return res.json({ success: true, data: JSON.parse(cached.value) });

      // Analyze representative extracted content from the complete indexed project,
      // rather than privileging README content.
      const fileInventory = project.files.map(file => `${file.path} [${file.category}]`).join('\n');
      const sourceContext = project.files
        .filter(file => file.extractedText)
        .sort((a, b) => (b.extractedText?.length || 0) - (a.extractedText?.length || 0))
        .map(file => `\n--- ${file.path} (${file.category}) ---\n${file.extractedText}`)
        .join('')
        .slice(0, 60000);
      const contentToAnalyze = `Project Name: ${project.name}\nProject Path: ${project.path}\n\nComplete File Inventory:\n${fileInventory}\n\nIndexed Project Content:${sourceContext}`;

      // Call AI service
      const response = await axios.post(`${AI_SERVICE_URL}/internal/ml/deep_analyze`, {
        content: contentToAnalyze,
        category: 'project',
        filename: project.name
      });

      if (response.data && response.data.success) {
        await prisma.$transaction([
          prisma.aICache.upsert({
            where: { cacheKey },
            update: { value: JSON.stringify(response.data.analysis), contentHash: cacheKey },
            create: { cacheType: 'analysis', cacheKey, value: JSON.stringify(response.data.analysis), contentHash: cacheKey }
          }),
          prisma.projectAnalysis.create({ data: { projectId: project.id, analysisType: 'full', result: JSON.stringify(response.data.analysis) } }),
          prisma.project.update({ where: { id: project.id }, data: { analyzedAt: new Date() } })
        ]);
        return res.json({ success: true, data: response.data.analysis });
      }

      return res.status(500).json({ success: false, error: 'AI analysis failed' });

    } catch (error: any) {
      logger.error(`Project analysis error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to analyze project' });
    }
  }

  static async uploadFiles(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const files = (req.files as Express.Multer.File[]) || [];

      if (!files.length) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const workspace = await prisma.workspace.findUnique({
        where: { userId }
      });

      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
      }

      const storedFiles = [];
      const duplicates: Array<{
        pendingId: string;
        filename: string;
        existingFilename: string;
        existingUploadedAt: Date | null;
      }> = [];
      let uploadRoot = '';

      for (const file of files) {
        uploadRoot = path.dirname(file.path);
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeType = mime.lookup(file.originalname) || file.mimetype || null;

        // Content-based dedup: multer gives every upload a unique on-disk
        // filename (timestamp-prefixed), so matching on `path` alone never
        // catches re-uploads of the same file. Hash the content instead.
        const contentHash = await calculateFileHash(file.path);
        const existing = await prisma.fileRecord.findFirst({
          where: { contentHash },
        });

        if (existing) {
          // Do NOT index or create a record yet - hold the file on disk and
          // let the user decide (Cancel = discard, Upload Again = proceed).
          const pendingId = crypto.randomUUID();
          pendingDuplicateUploads.set(pendingId, {
            path: file.path,
            filename: file.originalname,
            extension: ext,
            mimeType,
            size: file.size,
          });

          duplicates.push({
            pendingId,
            filename: file.originalname,
            existingFilename: existing.filename,
            existingUploadedAt: existing.indexedAt || existing.fileModifiedAt,
          });
          continue;
        }

        const fileRecord = await prisma.fileRecord.create({
          data: {
            path: file.path,
            filename: file.originalname,
            extension: ext,
            mimeType,
            category: categoryForUpload(ext),
            sizeBytes: BigInt(file.size),
            contentHash,
            fileModifiedAt: new Date(),
            status: 'discovered',
            projectId: null,
          }
        });

        indexQueue.push({ fileId: fileRecord.id });

        storedFiles.push({
          id: fileRecord.id,
          filename: fileRecord.filename,
          path: fileRecord.path,
          duplicate: false,
        });
      }



      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { status: 'scanning' }
      });

      return res.json({
        success: true,
        data: {
          uploaded: storedFiles,
          duplicates,
          sourcePath: uploadRoot,
          message: duplicates.length
            ? 'Some files already exist in your workspace and are waiting for your confirmation.'
            : 'Files queued for parsing and embedding'
        }
      });
    } catch (error: any) {
      logger.error(`Upload files error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to upload files' });
    }
  }

  static async cancelPendingUpload(req: AuthRequest, res: Response) {
    try {
      const { pendingId } = req.params;
      const pending = pendingDuplicateUploads.get(pendingId);

      if (!pending) {
        return res.status(404).json({ success: false, error: 'Pending upload not found' });
      }

      try {
        fs.unlinkSync(pending.path);
      } catch (unlinkErr: any) {
        logger.warn(`Failed to remove cancelled duplicate upload: ${unlinkErr.message}`);
      }

      pendingDuplicateUploads.delete(pendingId);
      return res.json({ success: true });
    } catch (error: any) {
      logger.error(`Cancel pending upload error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to cancel upload' });
    }
  }

  static async confirmPendingUpload(req: AuthRequest, res: Response) {
    try {
      const { pendingId } = req.params;
      const pending = pendingDuplicateUploads.get(pendingId);

      if (!pending) {
        return res.status(404).json({ success: false, error: 'Pending upload not found or already handled' });
      }

      // User explicitly chose "Upload Again" - proceed through the exact
      // same create + index path as a brand-new file.
      const contentHash = await calculateFileHash(pending.path);
      const fileRecord = await prisma.fileRecord.create({
        data: {
          path: pending.path,
          filename: pending.filename,
          extension: pending.extension,
          mimeType: pending.mimeType,
          category: categoryForUpload(pending.extension),
          sizeBytes: BigInt(pending.size),
          contentHash,
          fileModifiedAt: new Date(),
          status: 'discovered',
          projectId: null,
        }
      });

      indexQueue.push({ fileId: fileRecord.id });
      pendingDuplicateUploads.delete(pendingId);

      return res.json({
        success: true,
        data: {
          id: fileRecord.id,
          filename: fileRecord.filename,
          path: fileRecord.path,
        }
      });
    } catch (error: any) {
      logger.error(`Confirm pending upload error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to confirm upload' });
    }
  }
}

function categoryForUpload(ext: string): string {
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'].includes(ext)) return 'image';
  if (['.ppt', '.pptx', '.key'].includes(ext)) return 'presentation';
  if (['.csv', '.tsv', '.xls', '.xlsx'].includes(ext)) return 'spreadsheet';
  if (['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.html', '.css'].includes(ext)) return 'code';
  return 'document';
}
