// =====================================================================
// 🐘 Prisma Client — Singleton partagé
// =====================================================================
// 📖 En dev (HMR, Turborepo), Next.js recharge les modules en boucle.
//    Sans singleton, on crée une nouvelle connexion Prisma à chaque reload
//    → épuisement rapide du pool Postgres.
//
// 🎯 Source unique d'export pour les apps :
//    import { prisma } from '@qoe/db/client';
// =====================================================================

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * 🐘 Client Prisma partagé.
 * Réutilise l'instance en dev pour éviter l'épuisement du pool.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
