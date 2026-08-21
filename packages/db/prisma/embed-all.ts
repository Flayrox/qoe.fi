/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
// 🧠 Qoe.fi — Universal Vector Embeddings Engine (jina-embeddings-v3)
// =====================================================================
// Vectorise l'ensemble du corpus de production :
// 1. Articles complets (Titre + Tags + Extrait de contenu)
// 2. Pensées racines (Contenu + Tags + Auteur)
// 3. Pensées avec citations d'articles (Prompt contextuel hybride :
//    Pensée + Extrait cité + Titre de l'article + Auteur de l'article)
//
// Inférence : jina-embeddings-v3 (MRL 512 dims) sur http://127.0.0.1:8081
// Stockage : PostgreSQL pgvector (vector(512))
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

async function singleEmbedAttempt(text: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'jina-embeddings-v3',
      input: text.slice(0, 3500),
    });

    const req = http.request(
      process.env.EMBEDDING_URL || 'http://127.0.0.1:8081/v1/embeddings',
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

async function main() {
  console.log('\n==================================================================');
  console.log('  🧠 QOE.FI — INDEXATION VECTORIELLE UNIVERSELLE (JINA-v3 512d)');
  console.log('==================================================================\n');

  const startAll = Date.now();

  // -------------------------------------------------------------------
  // 1. INDEXATION DES ARTICLES
  // -------------------------------------------------------------------
  console.log('📚 [1/2] Indexation vectorielle des articles publiés...');
  const articles = await prisma.article.findMany({
    where: { published: true },
    select: { id: true, title: true, content: true, semanticTags: true },
  });

  let articleSuccess = 0;
  await mapConcurrent(articles, 3, async (art, idx) => {
    const plainContent = stripHtml(art.content);
    const tagsStr = (art.semanticTags || []).join(', ');
    const textToEmbed = `Titre: ${art.title} | Tags: ${tagsStr} | Contenu: ${plainContent.slice(0, 1500)}`;

    try {
      const vector = await embedTextWithRetry(textToEmbed);
      const vectorStr = `[${vector.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "Article" SET "embedding" = $1::vector WHERE id = $2`,
        vectorStr,
        art.id
      );
      articleSuccess++;
      if ((idx + 1) % 50 === 0 || idx + 1 === articles.length) {
        console.log(`  ├─ ✓ ${idx + 1}/${articles.length} articles vectorisés`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Erreur article ${art.id}:`, err.message);
    }
  });

  // -------------------------------------------------------------------
  // 2. INDEXATION DES PENSÉES & CITATIONS RACINES
  // -------------------------------------------------------------------
  console.log('\n💬 [2/2] Indexation vectorielle des pensées racines et citations...');
  const thoughts = await prisma.thought.findMany({
    where: {
      parentId: null,
      repostId: null,
      deletedAt: null,
      isDraft: false,
    },
    select: {
      id: true,
      content: true,
      tags: true,
      quotedArticleId: true,
      quotedExcerpt: true,
      author: { select: { name: true, username: true } },
      quotedArticle: {
        select: { title: true, semanticTags: true, author: { select: { name: true } } },
      },
    },
  });

  let thoughtSuccess = 0;
  await mapConcurrent(thoughts, 3, async (thought, idx) => {
    let prompt: string;

    if (thought.quotedArticleId && thought.quotedExcerpt) {
      const artTitle = thought.quotedArticle?.title || '';
      const artAuthor = thought.quotedArticle?.author?.name || '';
      prompt = `Réflexion: ${thought.content} | Extrait cité: "${thought.quotedExcerpt}" | Article: ${artTitle} | Auteur de l'article: ${artAuthor}`;
    } else {
      const tagsStr = (thought.tags || []).join(', ');
      prompt = `Pensée: ${thought.content} | Tags: ${tagsStr} | Auteur: ${thought.author.name}`;
    }

    try {
      const vector = await embedTextWithRetry(prompt);
      const vectorStr = `[${vector.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "Post" SET "embedding" = $1::vector WHERE id = $2`,
        vectorStr,
        thought.id
      );
      thoughtSuccess++;
      if ((idx + 1) % 100 === 0 || idx + 1 === thoughts.length) {
        console.log(`  ├─ ✓ ${idx + 1}/${thoughts.length} pensées vectorisées`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Erreur pensée ${thought.id}:`, err.message);
    }
  });

  const totalSec = ((Date.now() - startAll) / 1000).toFixed(2);
  console.log('\n==================================================================');
  console.log('  ✨ INDEXATION UNIVERSELLE TERMINÉE AVEC SUCCÈS !');
  console.log('==================================================================');
  console.table({
    'Articles Indexés': `${articleSuccess}/${articles.length}`,
    'Pensées & Quotes Indexées': `${thoughtSuccess}/${thoughts.length}`,
    'Temps Total': `${totalSec}s`,
  });
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
