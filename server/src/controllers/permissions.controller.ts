import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { setupWatchers } from '../workers/watcher.worker';

const prisma = new PrismaClient();

export class PermissionsController {
  
  static async getPermissions(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      
      const workspace = await prisma.workspace.findUnique({
        where: { userId }
      });
      
      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
      }
      
      const permissions = await prisma.permission.findMany({
        where: { workspaceId: workspace.id }
      });
      
      return res.json({ success: true, data: permissions });
    } catch (error: any) {
      logger.error(`Get permissions error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to retrieve permissions' });
    }
  }

  static async togglePermission(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const permissionId = String(req.params.id);
      const { enabled } = req.body;
      
      const permission = await prisma.permission.findUnique({
        where: { id: permissionId },
        include: { workspace: true }
      });
      
      if (!permission || permission.workspace.userId !== userId) {
        return res.status(404).json({ success: false, error: 'Permission not found' });
      }
      
      const updated = await prisma.permission.update({
        where: { id: permissionId },
        data: { enabled: Boolean(enabled), grantedAt: Boolean(enabled) ? new Date() : null }
      });
      
      if (updated.enabled) {
        setupWatchers();
      }
      
      return res.json({ success: true, data: updated });
    } catch (error: any) {
      logger.error(`Toggle permission error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to update permission' });
    }
  }

  static async addPermission(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { path, label } = req.body;
      
      if (!path || !label) {
        return res.status(400).json({ success: false, error: 'Path and label are required' });
      }
      
      const workspace = await prisma.workspace.findUnique({
        where: { userId }
      });
      
      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
      }
      
      const permission = await prisma.permission.create({
        data: {
          workspaceId: workspace.id,
          path,
          label,
          enabled: true,
          grantedAt: new Date()
        }
      });
      
      setupWatchers();
      
      return res.json({ success: true, data: permission });
    } catch (error: any) {
      logger.error(`Add permission error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to add permission' });
    }
  }

  static async removePermission(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const permissionId = String(req.params.id);
      
      const permission = await prisma.permission.findUnique({
        where: { id: permissionId },
        include: { workspace: true }
      });
      
      if (!permission || permission.workspace.userId !== userId) {
        return res.status(404).json({ success: false, error: 'Permission not found' });
      }
      
      await prisma.permission.delete({
        where: { id: permissionId }
      });
      
      return res.json({ success: true, message: 'Permission removed successfully' });
    } catch (error: any) {
      logger.error(`Remove permission error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to remove permission' });
    }
  }
}
