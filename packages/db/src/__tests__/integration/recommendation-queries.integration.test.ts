// =====================================================================
// 🧪 INTÉGRATION RÉELLE — Recommandations Circadiennes & pgvector
// =====================================================================
// 📖 Tourne contre un VRAI PostgreSQL avec pgvector via Testcontainers.
//    Valide l'absence d'erreurs 42883 de cast UUID/Text et la cohérence
//    des résultats vectoriels.
// =====================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDatabase, getClient, stopDatabase } from './setup';

let testClient: Awaited<ReturnType<typeof getClient>>;
let dbUrl: string;
let feedModule: typeof import('../../feed');

beforeAll(async () => {
  dbUrl = await startDatabase();
  testClient = getClient(dbUrl);
  (globalThis as Record<string, unknown>).prisma = testClient;
  feedModule = await import('../../feed');
});

afterAll(async () => {
  await stopDatabase();
});

describe('Feed & Recommendation SQL Queries (Real Postgres + pgvector)', () => {
  it('executes getSemanticTrendingTopics without errors', async () => {
    const user = await testClient.user.create({
      data: {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'philo@qoe.fi',
        name: 'Philosophe Test',
        username: 'philo_test',
      },
    });

    const pub = await testClient.publication.create({
      data: {
        id: 'pub-philo-1',
        name: 'Épistémé',
        slug: 'episteme',
        subdomain: 'episteme',
        type: 'PERSONAL',
      },
    });

    const category = await testClient.category.create({
      data: {
        id: 'cat-philo-1',
        name: 'Épistémologie & Sciences',
        slug: 'epistemologie-sciences',
        description: 'Essais sur la théorie de la connaissance',
        publicationId: pub.id,
      },
    });

    await testClient.article.create({
      data: {
        id: 'art-1',
        title: 'La nature de l attention',
        slug: 'nature-attention',
        content: 'Texte d essai sur la souveraineté attentionnelle',
        published: true,
        authorId: user.id,
        publicationId: pub.id,
        categoryId: category.id,
        readingTime: 6,
      },
    });

    const trends = await feedModule.getSemanticTrendingTopics({ limit: 3 });
    expect(Array.isArray(trends)).toBe(true);
    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0].topicName).toBe('Épistémologie & Sciences');
    expect(trends[0].topicName.startsWith('#')).toBe(false);
  });

  it('executes getSuggestedCreatorsByVector with valid UUID casting', async () => {
    const userA = await testClient.user.create({
      data: {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'reader@qoe.fi',
        name: 'Lecteur Curieux',
        username: 'lecteur_curieux',
      },
    });

    const userB = await testClient.user.create({
      data: {
        id: '55555555-5555-5555-5555-555555555555',
        email: 'creator_b@qoe.fi',
        name: 'Plume Inspirante',
        username: 'plume_inspirante',
        isCertified: true,
      },
    });

    const pubB = await testClient.publication.create({
      data: {
        id: 'pub-b-1',
        name: 'Revue Critique',
        slug: 'revue-critique',
        subdomain: 'critique',
        type: 'PERSONAL',
      },
    });

    await testClient.article.create({
      data: {
        id: 'art-b-1',
        title: 'Penser en dehors du flux',
        slug: 'penser-flux',
        content: 'Essai critique...',
        published: true,
        authorId: userB.id,
        publicationId: pubB.id,
        readingTime: 8,
      },
    });

    const suggestions = await feedModule.getSuggestedCreatorsByVector({
      userId: userA.id,
      limit: 4,
    });

    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].id).toBe(userB.id);
    expect(suggestions[0].isCertified).toBe(true);
  });

  it('executes getPersonalizedFeed in Cold-Start mode without throwing', async () => {
    const result = await feedModule.getPersonalizedFeed({
      limit: 10,
      userHour: 20, // Soirée
      userDayOfWeek: 1, // Lundi
    });

    expect(result).toBeDefined();
    expect(result.circadianProfile.name).toBe('EVENING_SANCTUARY');
    expect(Array.isArray(result.items)).toBe(true);
  });
});
