import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class WorkspaceMemory {
  
  static async getRecentContext(userId: string) {
    try {
      // 1. Recent Projects
      // We can infer recent projects by looking at recently accessed files
      const recentAccesses = await prisma.fileAccessLog.findMany({
        where: { file: { project: { isNot: null } } },
        include: { file: { include: { project: true } } },
        orderBy: { accessedAt: 'desc' },
        take: 20
      });
      
      const recentProjects = Array.from(new Set(
        recentAccesses
          .filter(a => a.file.project)
          .map(a => a.file.project!.name)
      )).slice(0, 5);
      
      // 2. Recent Files
      const recentFiles = await prisma.fileAccessLog.findMany({
        orderBy: { accessedAt: 'desc' },
        include: { file: true },
        take: 5
      });
      
      const recentFileNames = Array.from(new Set(
        recentFiles.map(f => f.file.filename)
      ));
      
      // 3. User Preferences (e.g. frequently used tech)
      const prefs = await prisma.userPreference.findMany({
        where: { userId }
      });
      
      const parsedPrefs: Record<string, unknown> = {};
      prefs.forEach(p => {
        try {
          parsedPrefs[p.key] = JSON.parse(p.value);
        } catch {
          parsedPrefs[p.key] = p.value;
        }
      });
      
      return {
        recent_projects: recentProjects,
        recent_files: recentFileNames,
        preferences: parsedPrefs
      };
      
    } catch (error) {
      console.error("Error fetching workspace memory:", error);
      return {};
    }
  }
}
