// Run this once with: node fix-categories.js
// It fixes files whose category got wrongly overwritten (images/presentations
// that became "document" by mistake).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.fileRecord.updateMany({
    where: { category: { in: ['image', 'presentation', 'spreadsheet', 'code'] } },
    data: { aiCategory: null },
  });
  console.log(`Done! Fixed ${result.count} file(s). You can restart your servers now.`);
}

main()
  .catch((e) => {
    console.error('Something went wrong:', e.message);
  })
  .finally(() => prisma.$disconnect());
