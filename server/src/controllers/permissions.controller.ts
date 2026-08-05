import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { setupWatchers } from '../workers/watcher.worker';
import { scanQueue } from '../workers/queue';
import { resolveWellKnownFolder, WELL_KNOWN_LABELS } from '../utils/wellKnownFolders';

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

  /**
   * Called right after the onboarding/settings permission screen. The
   * frontend only knows abstract keys like "documents" / "desktop" (it's
   * running in a browser with no filesystem access) - this resolves each
   * key to the real folder on this machine, creates/enables the matching
   * Permission rows, starts watching them, and kicks off an initial
   * recursive scan so existing files get indexed automatically.
   */
  static async grantDefaultFolders(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { folders } = req.body as { folders?: string[] };

      if (!Array.isArray(folders) || folders.length === 0) {
        return res.status(400).json({ success: false, error: 'folders array is required' });
      }

      const workspace = await prisma.workspace.findUnique({ where: { userId } });
      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
      }

      const granted: any[] = [];
      const skipped: string[] = [];

      for (const key of folders) {
        const resolvedPath = resolveWellKnownFolder(key);
        if (!resolvedPath) {
          skipped.push(key);
          continue;
        }

        const existing = await prisma.permission.findFirst({
          where: { workspaceId: workspace.id, path: resolvedPath },
        });

        if (existing) {
          const updated = existing.enabled
            ? existing
            : await prisma.permission.update({
                where: { id: existing.id },
                data: { enabled: true, grantedAt: new Date() },
              });
          granted.push(updated);
          continue;
        }

        const permission = await prisma.permission.create({
          data: {
            workspaceId: workspace.id,
            path: resolvedPath,
            label: WELL_KNOWN_LABELS[key] || key,
            enabled: true,
            grantedAt: new Date(),
          },
        });
        granted.push(permission);
      }

      setupWatchers();

      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { status: 'scanning' },
      });
      const job = await prisma.scanJob.create({
        data: { workspaceId: workspace.id, status: 'queued' },
      });
      scanQueue.push({ workspaceId: workspace.id, jobId: job.id });

      return res.json({
        success: true,
        data: { granted, skipped, jobId: job.id },
      });
    } catch (error: any) {
      logger.error(`Grant default folders error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to grant folders' });
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
