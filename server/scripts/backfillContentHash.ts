/**
 * backfillContentHash.ts
 *
 * Older documents (uploaded/scanned before the duplicate-detection fix) have
 * `contentHash: null` in the database, so the new upload-dedup check can't
 * match against them. This script hashes every such file (from its existing
 * on-disk path) and fills in contentHash - no schema change, no other data
 * touched.
 *
 * Run with:  cd server; npx tsx scripts/backfillContentHash.ts
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { calculateFileHash } from '../src/utils/hash';

const prisma = new PrismaClient();

async function main() {
  const files = await prisma.fileRecord.findMany({
    where: { contentHash: null },
    select: { id: true, path: true, filename: true },
  });

  console.log(`Found ${files.length} file(s) missing a content hash.`);

  let updated = 0;
  let missing = 0;

  for (const file of files) {
    if (!fs.existsSync(file.path)) {
      console.warn(`  ! Skipping "${file.filename}" - file no longer exists on disk at ${file.path}`);
      missing++;
      continue;
    }
    try {
      const hash = await calculateFileHash(file.path);
      await prisma.fileRecord.update({ where: { id: file.id }, data: { contentHash: hash } });
      updated++;
      console.log(`  Hashed: ${file.filename}`);
    } catch (err: any) {
      console.warn(`  ! Failed to hash "${file.filename}": ${err.message}`);
    }
  }

  console.log(`\nDone. Updated ${updated} record(s), skipped ${missing} missing file(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
