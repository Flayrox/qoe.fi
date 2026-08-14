import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import {
  searchThoughts,
  searchUsers,
  searchArticles,
  recordHashtags,
  getTrendingHashtags,
} from '../repositories/search';
import { prisma } from '../client';

vi.mock('../client', () => ({
  prisma: {
    thought: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    publication: {
      findMany: vi.fn(),
    },
    article: {
      findMany: vi.fn(),
    },
    trend: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('@qoe/db - Search & Trends Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty thoughts array for empty query', async () => {
    const res = await searchThoughts('');
    expect(res).toEqual({ thoughts: [], nextCursor: null });
    expect(prisma.thought.findMany).not.toHaveBeenCalled();
  });

  it('should query thoughts matching term or hashtags', async () => {
    const mockThoughts = [{ id: 't-1', content: 'Superbe journée sur #tech', tags: ['tech'] }];
    (prisma.thought.findMany as unknown as Mock).mockResolvedValue(mockThoughts);

    const res = await searchThoughts('tech', 20);
    expect(prisma.thought.findMany).toHaveBeenCalled();
    expect(res.thoughts).toEqual(mockThoughts);
  });

  it('should search publications by name or slug', async () => {
    const mockUsers = [{ id: 'u-1', name: 'Alexandre', slug: 'alex' }];
    (prisma.publication.findMany as unknown as Mock).mockResolvedValue(mockUsers);

    const res = await searchUsers('@alex');
    expect(prisma.publication.findMany).toHaveBeenCalledWith({
      where: {
        user: { is: { isShadowbanned: false, isSuspended: false } },
        OR: [
          { name: { contains: 'alex', mode: 'insensitive' } },
          { slug: { contains: 'alex', mode: 'insensitive' } },
          { subdomain: { contains: 'alex', mode: 'insensitive' } },
        ],
      },
      take: 15,
      select: expect.any(Object),
    });
    expect(res).toEqual(mockUsers);
  });

  it('should search published articles by title or content', async () => {
    const mockArticles = [{ id: 'a-1', title: "L'Avenir de l'IA" }];
    (prisma.article.findMany as unknown as Mock).mockResolvedValue(mockArticles);

    const res = await searchArticles('IA');
    expect(prisma.article.findMany).toHaveBeenCalled();
    expect(res).toEqual(mockArticles);
  });

  it('should record hashtags in Trend table and increment count', async () => {
    (prisma.trend.upsert as unknown as Mock).mockResolvedValue({ hashtag: 'tech', count: 1 });

    await recordHashtags(['#Tech', 'AI', '#Tech']);

    // Duplicates filtered out, tech and ai recorded
    expect(prisma.trend.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.trend.upsert).toHaveBeenCalledWith({
      where: { hashtag: 'tech' },
      create: { hashtag: 'tech', count: 1 },
      update: { count: { increment: 1 } },
    });
  });

  it('should retrieve trending hashtags sorted by count', async () => {
    const mockTrends = [
      { id: 'tr-1', hashtag: 'tech', count: 42 },
      { id: 'tr-2', hashtag: 'ai', count: 28 },
    ];
    (prisma.trend.findMany as unknown as Mock).mockResolvedValue(mockTrends);

    const res = await getTrendingHashtags(10);
    expect(prisma.trend.findMany).toHaveBeenCalledWith({
      take: 10,
      orderBy: [{ count: 'desc' }, { updatedAt: 'desc' }],
    });
    expect(res).toEqual(mockTrends);
  });
});
