import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class SettingsController {
  
  static async getAllSettings(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { category } = req.query;
      
      const query: any = { userId };
      if (category) {
        query.category = String(category);
      }
      
      const settings = await prisma.setting.findMany({
        where: query
      });
      
      // Group by category
      const grouped = settings.reduce((acc: any, setting) => {
        if (!acc[setting.category]) acc[setting.category] = {};
        acc[setting.category][setting.key] = setting.value;
        return acc;
      }, {});
      
      return res.json({ success: true, data: grouped });
    } catch (error: any) {
      logger.error(`Get settings error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to retrieve settings' });
    }
  }

  static async updateSettings(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { category, settings } = req.body;
      
      if (!category || !settings || typeof settings !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid settings payload' });
      }
      
      // Update each setting
      const promises = Object.entries(settings).map(([key, value]) => {
        return prisma.setting.upsert({
          where: { userId_key: { userId, key } },
          update: { value: String(value), category },
          create: { userId, key, value: String(value), category }
        });
      });
      
      await Promise.all(promises);
      
      return res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error: any) {
      logger.error(`Update settings error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
  }
}
