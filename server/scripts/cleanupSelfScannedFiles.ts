/**
 * cleanupSelfScannedFiles.ts
 *
 * Removes junk FileRecords that are NOT real user documents:
 *   1. Anything inside the app's own installation directory (self-scan).
 *   2. Dev/ops script files (.ps1, .bat, .sh, etc.) - e.g. fix scripts that
 *      got downloaded into the user's real Downloads folder while
 *      debugging this very app.
 *   3. Randomly-named files (UUID-style names) that don't look like
 *      anything a person would have named themselves.
 *
 * Run with:  cd server; npx tsx scripts/cleanupSelfScannedFiles.ts
 */
import path from 'path';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { removeFileFromFts } from '../src/utils/fts';
import { config } from '../src/config';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;
const APP_ROOT = path.resolve(__dirname, '..', '..');

const SCRIPT_EXTENSIONS = ['.ps1', '.psm1', '.bat', '.cmd', '.sh'];
const UUID_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.\w+)?$/i;

function isJunkFile(filePath: string, filename: string): boolean {
  const resolved = path.resolve(filePath);
  if (resolved === APP_ROOT || resolved.startsWith(APP_ROOT + path.sep)) return true;

  const ext = path.extname(filename).toLowerCase();
  if (SCRIPT_EXTENSIONS.includes(ext)) return true;

  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
  if (UUID_NAME_PATTERN.test(filename) || UUID_NAME_PATTERN.test(nameWithoutExt)) return true;

  return false;
}

async function deleteEmbeddings(fileId: string) {
  try {
    await axios.delete(`${AI_SERVICE_URL}/internal/embed/file/${fileId}`);
  } catch (err: any) {
    console.warn(`  ! Could not delete Chroma vectors for ${fileId}: ${err.message}`);
  }
}

async function main() {
  console.log(`App root: ${APP_ROOT}`);
  console.log('Scanning for junk/self-scanned file records...');

  const allFiles = await prisma.fileRecord.findMany({
    select: { id: true, path: true, filename: true },
  });

  const toDelete = allFiles.filter(f => isJunkFile(f.path, f.filename));

  console.log(`Found ${toDelete.length} junk file record(s) out of ${allFiles.length} total.`);

  for (const file of toDelete) {
    console.log(`  Removing: ${file.filename} (${file.id})`);
    await deleteEmbeddings(file.id);
    await removeFileFromFts(file.id);
    await prisma.fileRecord.delete({ where: { id: file.id } });
  }

  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  for (const ws of workspaces) {
    const totalFiles = await prisma.fileRecord.count();
    const totalProjects = await prisma.project.count();
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { totalFiles, totalProjects },
    });
  }

  console.log(`Done. Removed ${toDelete.length} file(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Cleanup failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
