import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("pgvector extension ensured.");
  } catch (e: any) {
    console.log("Error creating vector extension:", e.message);
  }
}
main().finally(() => prisma.$disconnect());
