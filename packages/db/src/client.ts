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

export * from "@prisma/client";

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

/**
 * 🔒 Génère un client Prisma sécurisé par Row Level Security (RLS) Supabase.
 * Toutes les opérations effectuées avec ce client s'exécutent dans une transaction PostgreSQL
 * isolée où les métadonnées de l'utilisateur actif (sub/userID et rôle) sont configurées.
 * 
 * Cela permet d'enforcer nativement et de manière étanche toutes tes règles RLS Supabase
 * (comme auth.uid() et auth.role()) directement lors des requêtes Prisma !
 */
export function getRlsClient(userId: string, role: string = "authenticated") {
  // 🛡️ BLINDAGE DEVSECOPS - Injection SQL impossible
  // On vérifie rigoureusement que le userId est un UUID valide (chiffres, lettres a-f, tirets)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    throw new Error("Sécurité : tentative d'injection SQL bloquée (UUID invalide) !");
  }

  // On vérifie rigoureusement que le rôle ne contient que des lettres et tirets bas
  const roleRegex = /^[a-z_]{1,30}$/i;
  if (!roleRegex.test(role)) {
    throw new Error("Sécurité : tentative d'injection SQL bloquée (Rôle invalide) !");
  }

  return prisma.$extends({
    query: {
      $allOperations({ args, query }) {
        const claims = JSON.stringify({ sub: userId, role });
        
        // Exécute SET LOCAL et la requête dans une transaction isolée
        return prisma.$transaction([
          prisma.$executeRawUnsafe(`SET LOCAL request.jwt.claim.sub = '${userId}';`),
          prisma.$executeRawUnsafe(`SET LOCAL request.jwt.claims = '${claims}';`),
          query(args),
        ]).then((results) => results[2]);
      },
    },
  });
}
