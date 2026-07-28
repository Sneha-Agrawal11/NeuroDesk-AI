/**
 * cleanupBenchmarkData.ts
 *
 * Removes every benchmark/dummy/generated document from the workspace,
 * permanently, across:
 *   - Prisma (FileRecord + cascaded Chunk / Relationship / FileAccessLog rows)
 *   - ChromaDB (via the AI service's /internal/embed/file/{id} delete endpoint)
 *   - SQLite FTS5 index
 *   - Any Project rows that point at a benchmark folder
 *
 * Run with:  pnpm --filter server exec tsx scripts/cleanupBenchmarkData.ts
 * (or from inside /server:  npx tsx scripts/cleanupBenchmarkData.ts)
 */
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { removeFileFromFts } from '../src/utils/fts';
import { config } from '../src/config';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;

// Anything whose path or filename matches these is benchmark/generated data,
// never something a real user uploaded.
const BENCHMARK_PATH_FRAGMENTS = ['benchmark_data_large', 'benchmark_data'];
const BENCHMARK_FILENAME_PATTERNS = [
  /^note_\d+\.(md|txt)$/i,
  /^doc_\d+\.(pdf|docx|pptx|xlsx|png)$/i,
  /^code_\d+\.\w+$/i,
  /^test_document\.\w+$/i,
  /^resume\d*\.(pdf|docx)$/i, // from benchmark.ts's generated resume1.pdf / resume_copy.pdf
];

function isBenchmarkRecord(path: string, filename: string): boolean {
  if (BENCHMARK_PATH_FRAGMENTS.some(frag => path.includes(frag))) return true;
  return BENCHMARK_FILENAME_PATTERNS.some(pattern => pattern.test(filename));
}

async function deleteEmbeddings(fileId: string) {
  try {
    await axios.delete(`${AI_SERVICE_URL}/internal/embed/file/${fileId}`);
  } catch (err: any) {
    console.warn(`  ! Could not delete Chroma vectors for ${fileId}: ${err.message}`);
  }
}

async function main() {
  console.log('Scanning for benchmark/dummy file records...');

  const allFiles = await prisma.fileRecord.findMany({
    select: { id: true, path: true, filename: true },
  });

  const toDelete = allFiles.filter(f => isBenchmarkRecord(f.path, f.filename));

  console.log(`Found ${toDelete.length} benchmark/dummy file record(s) out of ${allFiles.length} total.`);

  for (const file of toDelete) {
    console.log(`  Removing: ${file.filename} (${file.id})`);
    await deleteEmbeddings(file.id);
    await removeFileFromFts(file.id);
    // Prisma cascades Chunk / Relationship / FileAccessLog automatically
    // because schema.prisma marks those relations onDelete: Cascade.
    await prisma.fileRecord.delete({ where: { id: file.id } });
  }

  // Also remove any Project row that was accidentally created from a
  // benchmark folder (e.g. if benchmark_data looked like a project root).
  const allProjects = await prisma.project.findMany({ select: { id: true, path: true, name: true } });
  const benchmarkProjects = allProjects.filter(p =>
    BENCHMARK_PATH_FRAGMENTS.some(frag => p.path.includes(frag))
  );

  for (const project of benchmarkProjects) {
    console.log(`  Removing benchmark project: ${project.name} (${project.id})`);
    // ProjectAnalysis cascades; FileRecord.projectId is a plain nullable FK
    // (not cascaded), so detach any remaining files first.
    await prisma.fileRecord.updateMany({
      where: { projectId: project.id },
      data: { projectId: null },
    });
    await prisma.project.delete({ where: { id: project.id } });
  }

  // Recompute workspace file counts so the dashboard totals aren't stale.
  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  for (const ws of workspaces) {
    const totalFiles = await prisma.fileRecord.count();
    const totalProjects = await prisma.project.count();
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { totalFiles, totalProjects },
    });
  }

  console.log(`Done. Removed ${toDelete.length} file(s) and ${benchmarkProjects.length} project(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Cleanup failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
