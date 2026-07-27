import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class GraphController {
  
  static async getWorkspaceGraph(req: AuthRequest, res: Response) {
    try {
      const { projectId } = req.query;
      
      // Fetch Relationships
      const query: any = {};
      
      if (projectId) {
        query.sourceFile = { projectId: String(projectId) };
      }
      
      const relationships = await prisma.relationship.findMany({
        where: query,
        include: {
          sourceFile: { select: { id: true, filename: true, category: true, aiTags: true } },
          targetFile: { select: { id: true, filename: true, category: true, aiTags: true } }
        },
        take: 500 // Prevent massive payload for visualization
      });
      
      // Build Nodes and Edges for standard graph vis libraries (like react-force-graph)
      const nodesMap = new Map<string, any>();
      const edges: any[] = [];
      
      relationships.forEach(rel => {
        // Add nodes if not exist
        if (!nodesMap.has(rel.sourceFileId)) {
          nodesMap.set(rel.sourceFileId, {
            id: rel.sourceFileId,
            label: rel.sourceFile.filename,
            group: rel.sourceFile.category,
            tags: rel.sourceFile.aiTags ? JSON.parse(rel.sourceFile.aiTags) : []
          });
        }
        
        if (!nodesMap.has(rel.targetFileId)) {
          nodesMap.set(rel.targetFileId, {
            id: rel.targetFileId,
            label: rel.targetFile.filename,
            group: rel.targetFile.category,
            tags: rel.targetFile.aiTags ? JSON.parse(rel.targetFile.aiTags) : []
          });
        }
        
        // Add edge
        edges.push({
          source: rel.sourceFileId,
          target: rel.targetFileId,
          label: rel.relationshipType,
          value: rel.confidence
        });
      });
      
      return res.json({ 
        success: true, 
        data: {
          nodes: Array.from(nodesMap.values()),
          edges
        }
      });
      
    } catch (error: any) {
      logger.error(`Get workspace graph error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to retrieve graph data' });
    }
  }
}
