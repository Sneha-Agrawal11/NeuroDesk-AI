import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { scanQueue } from '../workers/queue';
import { indexQueue } from '../workers/queue';

const prisma = new PrismaClient();

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
      const fileId = req.params.id;
      const fileRecord = await prisma.fileRecord.findUnique({
        where: { id: fileId }
      });

      if (!fileRecord) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      // Read file content
      const fs = require('fs');
      if (!fs.existsSync(fileRecord.path)) {
        return res.status(404).json({ success: false, error: 'File on disk not found' });
      }
      
      const content = fs.readFileSync(fileRecord.path, 'utf8');

      // Call AI service for deep analysis
      const axios = require('axios');
      const response = await axios.post(`http://localhost:8000/internal/ml/deep_analyze`, {
        content: content,
        category: fileRecord.aiCategory || fileRecord.category,
        filename: fileRecord.filename
      });

      if (response.data && response.data.success) {
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
      const projectId = req.params.id;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { FileRecord: { select: { path: true, filename: true, category: true, sizeBytes: true } } }
      });

      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      // Collect some context to send to AI
      const fileList = project.FileRecord.map(f => `${f.path}`).join('\n');
      
      const fs = require('fs');
      let readmeContent = '';
      const readmeFile = project.FileRecord.find(f => f.filename.toLowerCase() === 'readme.md');
      if (readmeFile && fs.existsSync(readmeFile.path)) {
        readmeContent = fs.readFileSync(readmeFile.path, 'utf8');
      }

      const contentToAnalyze = `Project Name: ${project.name}\nProject Path: ${project.path}\nFiles:\n${fileList.substring(0, 5000)}\n\nREADME:\n${readmeContent.substring(0, 10000)}`;

      // Call AI service
      const axios = require('axios');
      const response = await axios.post(`http://localhost:8000/internal/ml/deep_analyze`, {
        content: contentToAnalyze,
        category: 'project',
        filename: project.name
      });

      if (response.data && response.data.success) {
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

        const fileRecord = await prisma.fileRecord.upsert({
          where: { path: file.path },
          update: {
            filename: file.originalname,
            extension: ext,
            mimeType,
            sizeBytes: BigInt(file.size),
            status: 'discovered',
            projectId: null,
          },
          create: {
            path: file.path,
            filename: file.originalname,
            extension: ext,
            mimeType,
            category: ext === '.pdf' || ext === '.txt' || ext === '.md' ? 'document' : 'document',
            sizeBytes: BigInt(file.size),
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
    