// =====================================================================
// 🧪 INTÉGRATION RÉELLE — replies & threads (rootId)
// =====================================================================
// 📖 Vérifie le comportement de création de réponses : le rootId doit
//    pointer vers le post racine, les compteurs replyCount se mettent à
//    jour, et le feed suit la hiérarchie. Tourne contre un vrai Postgres.
// =====================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDatabase, getClient, stopDatabase } from './setup';

let testClient: Awaited<ReturnType<typeof getClient>>;
let repo: typeof import('../../repositories/posts');

beforeAll(async () => {
  const url = await startDatabase();
  testClient = getClient(url);
  (globalThis as Record<string, unknown>).prisma = testClient;
  repo = await import('../../repositories/posts');
});

afterAll(async () => {
  await stopDatabase();
});

describe('replyToPost (Postgres réel)', () => {
  it('crée une réponse avec rootId pointant vers le post racine', async () => {
    await testClient.user.create({
      data: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'r1@qoe.fi', name: 'Replyer A' },
    });
    await testClient.user.create({
      data: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', email: 'r2@qoe.fi', name: 'Replyer B' },
    });

    const root = await repo.createThought({
      content: 'Root post',
      authorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });

    const reply = await repo.replyToPost(
      root.id,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'First reply'
    );
    expect(reply.parentId).toBe(root.id);
    expect(reply.rootId).toBe(root.id);
    expect(reply.content).toBe('First reply');

    // La réponse racine a bien un compteur replyCount = 1
    const rootReloaded = await testClient.thought.findUnique({ where: { id: root.id } });
    expect(rootReloaded?.replyCount).toBe(1);

    // La notification REPLY est créée pour l'auteur du post racine
    const notifications = await testClient.notification.findMany({
      where: {
        recipientId: root.authorId,
        senderId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        type: 'REPLY',
      },
    });
    expect(notifications).toHaveLength(1);
  });

  it("le rootId d'une réponse à une réponse reste le post original", async () => {
    await testClient.user.create({
      data: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', email: 'r3@qoe.fi', name: 'Replyer C' },
    });
    await testClient.user.create({
      data: { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', email: 'r4@qoe.fi', name: 'Replyer D' },
    });
    await testClient.user.create({
      data: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', email: 'r5@qoe.fi', name: 'Replyer E' },
    });

    const root = await repo.createThought({
      content: 'Second root',
      authorId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });
    const reply1 = await repo.replyToPost(
      root.id,
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'Level 1'
    );
    const reply2 = await repo.replyToPost(
      reply1.id,
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'Level 2'
    );

    // Le rootId de la réponse de niveau 2 pointe toujours vers le post racine
    expect(reply2.rootId).toBe(root.id);
    expect(reply2.parentId).toBe(reply1.id);
  });
});
