import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("pgvector extension ensured.");
    
    // Create HNSW index for cosine distance on the Article's embedding field
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS article_embedding_hnsw_idx 
      ON "Article" 
      USING hnsw (embedding vector_cosine_ops);
    `);
    console.log("HNSW vector index ensured on Article table.");
  } catch (e: any) {
    console.log("Error ensuring pgvector or index:", e.message);
  }
}
main().finally(() => prisma.$disconnect());
