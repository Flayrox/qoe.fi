import { prisma } from '../packages/db/src/client';

async function main() {
  console.log('Adding allowComments columns to User and Article tables if not exists...');
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "allowComments" BOOLEAN NOT NULL DEFAULT true;`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "allowComments" BOOLEAN NOT NULL DEFAULT true;`
  );
  console.log('Successfully added allowComments columns!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration script error:', err);
  process.exit(1);
});
