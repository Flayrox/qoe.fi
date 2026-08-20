/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
// 🧠 Qoe.fi — User Profile Vector Embeddings Backfill (jina-embeddings-v3)
// =====================================================================
// Vectorise les profils utilisateurs pour le moteur de recommandation :
//   Profil (nom, pseudo) + Rôle + Bio de la publication + Onboarding
//   + Démographie — le tout en un prompt unique.
//
// Inférence : jina-embeddings-v3 (MRL 512 dims), EMBEDDING_URL ou
//             http://127.0.0.1:8081/v1/embeddings
// Stockage : PostgreSQL pgvector (vector(512)) via SQL brut.
//
// Usage : pnpm embed:users   (depuis packages/db)
// =====================================================================

import { PrismaClient } from '@prisma/client';
import http from 'node:http';

const prisma = new PrismaClient();

function singleEmbedAttempt(text: string): Promise<number[]> {
  const embeddingUrl = process.env.EMBEDDING_URL || 'http://127.0.0.1:8081/v1/embeddings';
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: process.env.EMBEDDING_MODEL || 'jina-embeddings-v3',
      input: text.slice(0, 3500),
    });

    const req = http.request(
      embeddingUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.data && json.data[0] && json.data[0].embedding) {
              // MRL : tronque à 512 dims (colonne vector(512)).
              resolve(json.data[0].embedding.slice(0, 512));
            } else {
              reject(new Error(`Réponse invalide : ${body.slice(0, 100)}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write(data);
    req.end();
  });
}

async function embedTextWithRetry(text: string, maxRetries = 3): Promise<number[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await singleEmbedAttempt(text);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw new Error('Retries exceeded');
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let currentIdx = 0;

  async function worker() {
    while (currentIdx < items.length) {
      const idx = currentIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 🧠 Backfill des embeddings de profils utilisateurs (jina-embeddings-v3, 512d).
 * Réutilisé par le seed (prisma/seed-large.ts) et par le script autonome
 * `pnpm embed:users`. Retourne { success, failed }.
 */
export async function embedAllUsers(
  client: PrismaClient
): Promise<{ success: number; failed: number }> {
  const users = await client.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      gender: true,
      ageRange: true,
      countryCode: true,
      onboardingText: true,
      publication: { select: { bio: true, type: true, name: true } },
    },
  });

  console.log(`👥 ${users.length} profils à vectoriser...\n`);
  const startAll = Date.now();

  let success = 0;
  let failed = 0;
  await mapConcurrent(users, 8, async (u, idx) => {
    const parts = [
      `Profil: ${u.name || 'Utilisateur'}${u.username ? ` (${u.username})` : ''}`,
      `Rôle: ${u.role}`,
      u.publication?.name ? `Publication: ${u.publication.name}` : '',
      u.publication?.bio ? `Bio: ${u.publication.bio}` : '',
      u.onboardingText ? `Intention: ${u.onboardingText}` : '',
      `Démographie: ${[u.gender, u.ageRange, u.countryCode].filter(Boolean).join(', ')}`,
    ].filter(Boolean);
    const textToEmbed = parts.join(' | ');

    try {
      const vector = await embedTextWithRetry(textToEmbed);
      const vectorStr = `[${vector.join(',')}]`;
      await client.$executeRawUnsafe(
        `UPDATE "User" SET "embedding" = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        u.id
      );
      success++;
      if ((idx + 1) % 100 === 0 || idx + 1 === users.length) {
        console.log(`  ├─ ✓ ${idx + 1}/${users.length} profils vectorisés`);
      }
    } catch (err: any) {
      failed++;
      console.warn(`  ⚠️ Erreur profil ${u.id}:`, err.message);
    }
  });
  const totalSec = ((Date.now() - startAll) / 1000).toFixed(2);
  console.log(`  ✅ ${success} profils vectorisés (${failed} échecs) en ${totalSec}s.`);
  return { success, failed };
}

async function main() {
  console.log('\n==================================================================');
  console.log('  🧠 QOE.FI — BACKFILL EMBEDDINGS PROFILS UTILISATEURS (JINA-v3 512d)');
  console.log('==================================================================\n');
  await embedAllUsers(prisma);
  await prisma.$disconnect();
}

// Exécution directe : `pnpm embed:users`
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((e) => {
    console.error('\n❌ Erreur:', e);
    process.exit(1);
  });
}
