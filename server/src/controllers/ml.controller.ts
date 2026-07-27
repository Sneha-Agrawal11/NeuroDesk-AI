import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { config } from '../config';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;

export class MLController {
  
  static async getProjectAnalytics(req: AuthRequest, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { files: { select: { filename: true, sizeBytes: true, extension: true, aiCategory: true } } }
      });
      
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      
      // We can call the python ML service on-the-fly or fetch cached ProjectAnalysis
      let healthData = null;
      
      try {
        const mlRes = await axios.post(`${AI_SERVICE_URL}/internal/ml/project/health`, {
          files: project.files
        });
        if (mlRes.data.success) {
          healthData = mlRes.data.analysis;
          
          // Cache the result
          await prisma.projectAnalysis.create({
            data: {
              projectId: project.id,
              analysisType: 'health',
              result: JSON.stringify(healthData)
            }
          });
          
          // Update project score
          await prisma.project.update({
             where: { id: project.id },
             data: { healthScore: healthData.health_score, healthFactors: JSON.stringify(healthData.explanation) }
          });
        }
      } catch (err: any) {
        logger.warn(`Failed to generate project analytics: ${err.message}`);
        // Fallback to cached if available
        const cached = await prisma.projectAnalysis.findFirst({
           where: { projectId: project.id, analysisType: 'health' },
           orderBy: { createdAt: 'desc' }
        });
        if (cached) {
           healthData = JSON.parse(cached.result);
        }
      }
      
      return res.json({ 
        success: true, 
        data: {
          project,
          health: healthData
        }
      });
      
    } catch (error: any) {
      logger.error(`Get project analytics error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to retrieve analytics' });
    }
  }

  static async getWorkspaceAnalytics(req: AuthRequest, res: Response) {
    try {
      // Aggregate stats across all files
      const totalFiles = await prisma.fileRecord.count();
      const filesByCategory = await prisma.fileRecord.groupBy({
        by: ['aiCategory'],
        _count: { aiCategory: true }
      });
      
      const totalProjects = await prisma.project.count();
      const averageProjectHealth = await prisma.project.aggregate({
        _avg: { healthScore: true }
      });
      
      // Generate Real Recommendations
      const recommendations: string[] = [];
      
      const unassignedFiles = await prisma.fileRecord.count({ where: { projectId: null } });
      if (unassignedFiles > 0) {
        recommendations.push(`Consider organizing ${unassignedFiles} unassigned files into projects.`);
      }

      const projectsWithoutReadme = await prisma.project.findMany({
        where: {
          NOT: {
            files: {
              some: {
                filename: {
                  equals: 'README.md'
                }
              }
            }
          }
        }
      });

      for (const p of projectsWithoutReadme) {
        recommendations.push(`Project '${p.name}' is missing a README.`);
      }

      const projectsNeedingUpdates = await prisma.project.findMany({
        where: { healthScore: { lt: 70 } }
      });

      for (const p of projectsNeedingUpdates) {
        recommendations.push(`Review health of '${p.name}' project (score: ${p.healthScore}).`);
      }

      if (recommendations.length === 0) {
        recommendations.push("Workspace is healthy and well-organized.");
      }
      
      return res.json({
        success: true,
        data: {
          totalFiles,
          totalProjects,
          filesByCategory,
          averageProjectHealth: averageProjectHealth._avg.healthScore,
          recommendations
        }
      });
      
    } catch (error: any) {
      logger.error(`Get workspace analytics error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to retrieve workspace analytics' });
    }
  }
}
