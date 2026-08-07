// Run this anytime with: node check-progress.js
// Shows how many images are still pending vs done.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.fileRecord.count({ where: { category: 'image' } });
  const done = await prisma.fileRecord.count({
    where: { category: 'image', status: { in: ['indexed', 'error'] } },
  });
  const pending = total - done;
  console.log(`Images: ${total} total | ${done} processed | ${pending} still pending`);
  if (pending === 0) {
    console.log('All done! You can go check your images now.');
  } else {
    console.log('Still working... run this script again in a few minutes to check.');
  }
}

main()
  .catch((e) => console.error('Error:', e.message))
  .finally(() => prisma.$disconnect());
