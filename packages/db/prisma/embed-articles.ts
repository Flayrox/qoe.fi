/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
// 🧠 Qoe.fi — Vector Embeddings Backfill Script (jina-embeddings-v3)
// =====================================================================
// Embeds all published articles in the database using the local Jina
// embeddings server running on http://127.0.0.1:8081.
// Dimensions: 512 (MRL Matryoshka Representation Learning).
// =====================================================================

import { PrismaClient } from '@prisma/client';
import http from 'node:http';

const prisma = new PrismaClient();

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function embedText(text: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'jina-embeddings-v3',
      input: text.slice(0, 4000), // Max context
    });

    const req = http.request(
      'http://127.0.0.1:8081/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.data && json.data[0] && json.data[0].embedding) {
              // Truncate to 512 dimensions (MRL)
              resolve(json.data[0].embedding.slice(0, 512));
            } else {
              reject(new Error(`Invalid response format: ${body}`));
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
      reject(new Error('Request timed out'));
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('\n==================================================================');
  console.log('  🧠 QOE.FI — CALCUL DES VECTEURS D’EMBEDDING (JINA-v3 512d)');
  console.log('==================================================================\n');

  const start = Date.now();
  const articles = await prisma.article.findMany({
    where: { published: true },
    select: { id: true, title: true, content: true, semanticTags: true },
  });

  console.log(`📚 ${articles.length} articles publiés à indexer...\n`);

  let successCount = 0;
  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const plainContent = stripHtml(art.content);
    const tagsStr = (art.semanticTags || []).join(', ');
    const textToEmbed = `Titre: ${art.title} | Tags: ${tagsStr} | Contenu: ${plainContent.slice(0, 1500)}`;

    try {
      const vector = await embedText(textToEmbed);
      const vectorStr = `[${vector.join(',')}]`;

      await prisma.$executeRawUnsafe(
        `UPDATE "Article" SET "embedding" = $1::vector WHERE id = $2`,
        vectorStr,
        art.id
      );

      successCount++;
      if ((i + 1) % 25 === 0 || i + 1 === articles.length) {
        console.log(`  ├─ ✓ ${i + 1}/${articles.length} articles vectorisés`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Erreur sur article ${art.id} (${art.title}):`, err.message);
    }
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(2);
  console.log('\n==================================================================');
  console.log(
    `  ✨ INDEXATION VECTORIELLE TERMINÉE : ${successCount}/${articles.length} en ${durationSec}s`
  );
  console.log('==================================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
