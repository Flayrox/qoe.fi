// =====================================================================
// 🧪 INTÉGRATION RÉELLE — createThought / toggleLike / toggleRepost
// =====================================================================
// 📖 Tourne contre un VRAI Postgres (pgvector) via Testcontainers avec les
//    migrations Prisma appliquées. Aucun mock : le SQL est réel.
//    Teste le comportement de bout en bout du repo posts.ts.
// =====================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDatabase, getClient, stopDatabase } from './setup';

// Le client singleton de @qoe/db (utilisé par les repos) pointe vers le
// conteneur de test AVANT l'import des repos.
let testClient: Awaited<ReturnType<typeof getClient>>;
let dbUrl: string;
let repo: typeof import('../../repositories/posts');

beforeAll(async () => {
  dbUrl = await startDatabase();
  testClient = getClient(dbUrl);
  (globalThis as Record<string, unknown>).prisma = testClient;
  repo = await import('../../repositories/posts');
});

afterAll(async () => {
  await stopDatabase();
});

async function seedUser(id: string, email: string, name: string) {
  return testClient.user.create({
    data: { id, email, name, username: `user_${id}` },
  });
}

describe('createThought (Postgres réel)', () => {
  it('crée un thought public avec ses métadonnées', async () => {
    await seedUser('11111111-1111-1111-1111-111111111111', 'a@qoe.fi', 'Author A');

    const post = await repo.createThought({
      content: 'Hello real Postgres!',
      authorId: '11111111-1111-1111-1111-111111111111',
      tags: ['test', 'db'],
    });

    expect(post.id).toBeDefined();
    expect(post.content).toBe('Hello real Postgres!');
    expect(post.tags).toEqual(['test', 'db']);
    expect(post.visibility).toBe('public');
    expect(post.isDraft).toBe(false);

    // Vérifie que le compteur est initialisé à zéro
    expect(post.likeCount).toBe(0);
    expect(post.repostCount).toBe(0);
  });

  it('crée un thought avec des pièces jointes ordonnées', async () => {
    await seedUser('22222222-2222-2222-2222-222222222222', 'b@qoe.fi', 'Author B');

    const post = await repo.createThought({
      content: 'Post with images',
      authorId: '22222222-2222-2222-2222-222222222222',
      attachments: [
        { url: 'https://img/a.png', order: 0 },
        { url: 'https://img/b.png', order: 1 },
      ],
    });

    expect(post.attachments).toHaveLength(2);
    expect(post.attachments[0].url).toBe('https://img/a.png');
    expect(post.attachments[0].order).toBe(0);
    expect(post.attachments[1].order).toBe(1);
  });

  it('crée un brouillon non visible dans le feed public', async () => {
    await seedUser('33333333-3333-3333-3333-333333333333', 'c@qoe.fi', 'Author C');

    const draft = await repo.createThought({
      content: 'Draft post',
      authorId: '33333333-3333-3333-3333-333333333333',
      isDraft: true,
    });

    expect(draft.isDraft).toBe(true);

    // Le feed ne doit pas renvoyer les brouillons
    const feed = await testClient.thought.findMany({
      where: { authorId: '33333333-3333-3333-3333-333333333333', isDraft: false },
    });
    expect(feed).toHaveLength(0);
  });
});

describe('toggleLike / toggleRepost (Postgres réel)', () => {
  it('toggle un like et met à jour le compteur de cache', async () => {
    await seedUser('44444444-4444-4444-4444-444444444444', 'd@qoe.fi', 'Author D');
    await seedUser('55555555-5555-5555-5555-555555555555', 'e@qoe.fi', 'Author E');

    const post = await repo.createThought({
      content: 'Lovable post',
      authorId: '44444444-4444-4444-4444-444444444444',
    });

    const liked = await repo.toggleLike(post.id, '55555555-5555-5555-5555-555555555555');
    expect(liked.liked).toBe(true);

    const reloaded = await testClient.thought.findUnique({ where: { id: post.id } });
    expect(reloaded?.likeCount).toBe(1);

    // Second toggle = unlike
    const unliked = await repo.toggleLike(post.id, '55555555-5555-5555-5555-555555555555');
    expect(unliked.liked).toBe(false);

    const reloaded2 = await testClient.thought.findUnique({ where: { id: post.id } });
    expect(reloaded2?.likeCount).toBe(0);
  });

  it('toggle un repost et met à jour le compteur de cache', async () => {
    await seedUser('66666666-6666-6666-6666-666666666666', 'f@qoe.fi', 'Author F');
    await seedUser('77777777-7777-7777-7777-777777777777', 'g@qoe.fi', 'Author G');

    const post = await repo.createThought({
      content: 'Repostable post',
      authorId: '66666666-6666-6666-6666-666666666666',
    });

    const reposted = await repo.toggleRepost(post.id, '77777777-7777-7777-7777-777777777777');
    expect(reposted.reposted).toBe(true);

    const reloaded = await testClient.thought.findUnique({ where: { id: post.id } });
    expect(reloaded?.repostCount).toBe(1);

    const unreposted = await repo.toggleRepost(post.id, '77777777-7777-7777-7777-777777777777');
    expect(unreposted.reposted).toBe(false);

    const reloaded2 = await testClient.thought.findUnique({ where: { id: post.id } });
    expect(reloaded2?.repostCount).toBe(0);
  });
});
