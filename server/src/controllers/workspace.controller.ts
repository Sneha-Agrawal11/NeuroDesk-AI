import { Response } from 'express';
import fs from 'fs';
import path from 'path';
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

      const workspace = await prisma.workspace.findUnique({
        where: { userId },
        include: {
          scanJobs: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
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

      return res.status(500).json({ success: false, error: 'AI analysis failed' });

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
          // Same content already tracked: discard this duplicate upload and
          // hand back the existing document instead of creating a new one.
          try {
            fs.unlinkSync(file.path);
          } catch (unlinkErr: any) {
            logger.warn(`Failed to remove duplicate upload file ${file.path}: ${unlinkErr.message}`);
          }

          storedFiles.push({
            id: existing.id,
            filename: existing.filename,
            path: existing.path,
            duplicate: true,
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
          sourcePath: uploadRoot,
          message: 'Files queued for parsing and embedding'
        }
      });
    } catch (error: any) {
      logger.error(`Upload files error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to upload files' });
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
