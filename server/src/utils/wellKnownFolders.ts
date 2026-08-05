import os from 'os';
import path from 'path';
import fs from 'fs';

const home = os.homedir();

const CANDIDATES: Record<string, string[]> = {
  documents: [path.join(home, 'Documents')],
  projects: [
    path.join(home, 'Documents', 'Projects'),
    path.join(home, 'Projects'),
    path.join(home, 'source', 'repos'),
    path.join(home, 'dev'),
    path.join(home, 'Development'),
  ],
  downloads: [path.join(home, 'Downloads')],
  desktop: [path.join(home, 'Desktop')],
  pictures: [path.join(home, 'Pictures')],
};

export const WELL_KNOWN_LABELS: Record<string, string> = {
  documents: 'Documents & Research',
  projects: 'Source Code & Repos',
  downloads: 'Downloads Directory',
  desktop: 'Desktop Workspace',
  pictures: 'Images & Diagrams',
};

export function resolveWellKnownFolder(key: string): string | null {
  const candidates = CANDIDATES[key];
  if (!candidates) return null;
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return null;
}
