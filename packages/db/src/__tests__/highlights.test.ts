import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import { createHighlight, upvoteHighlight, getArticleHighlights } from '../repositories/highlights';
import { prisma } from '../client';

vi.mock('../client', () => ({
  prisma: {
    article: {
      findUnique: vi.fn(),
    },
    highlight: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    annotationUpvote: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('@qoe/db - Highlights & Annotations Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a private highlight successfully', async () => {
    (prisma.article.findUnique as unknown as Mock).mockResolvedValue({
      authorId: 'author-1',
      allowPublicAnnotations: true,
      author: { allowPublicAnnotations: true },
    });

    const mockHighlight = {
      id: 'hl-1',
      articleId: 'art-1',
      readerId: 'reader-1',
      text: 'Ceci est une citation',
      isPublic: false,
      isOfficial: false,
    };
    (prisma.highlight.create as unknown as Mock).mockResolvedValue(mockHighlight);

    const res = await createHighlight({
      articleId: 'art-1',
      readerId: 'reader-1',
      text: 'Ceci est une citation',
      isPublic: false,
    });

    expect(prisma.highlight.create).toHaveBeenCalledWith({
      data: {
        articleId: 'art-1',
        readerId: 'reader-1',
        text: 'Ceci est une citation',
        note: null,
        isPublic: false,
        isOfficial: false,
      },
      include: expect.any(Object),
    });
    expect(res).toEqual(mockHighlight);
  });

  it('should restrict official annotations to the primary article author only', async () => {
    (prisma.article.findUnique as unknown as Mock).mockResolvedValue({
      authorId: 'author-1',
      allowPublicAnnotations: true,
      author: { allowPublicAnnotations: true },
    });

    (prisma.highlight.create as unknown as Mock).mockResolvedValue({});

    // Non-author attempting isOfficial: true -> forced to isOfficial: false
    await createHighlight({
      articleId: 'art-1',
      readerId: 'reader-2', // Different from author-1
      text: 'Note officielle frauduleuse',
      isOfficial: true,
    });

    expect(prisma.highlight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isOfficial: false,
      }),
      include: expect.any(Object),
    });
  });

  it('should toggle upvote on a public highlight', async () => {
    (prisma.annotationUpvote.findUnique as unknown as Mock).mockResolvedValue(null);
    (prisma.annotationUpvote.create as unknown as Mock).mockResolvedValue({ id: 'up-1' });
    (prisma.highlight.update as unknown as Mock).mockResolvedValue({ upvotesCount: 5 });

    const res = await upvoteHighlight('hl-1', 'user-1');

    expect(prisma.annotationUpvote.create).toHaveBeenCalledWith({
      data: { highlightId: 'hl-1', userId: 'user-1' },
    });
    expect(res).toEqual({ upvotesCount: 5, hasUpvoted: true });
  });

  it('should retrieve official, public and user highlights for an article', async () => {
    const mockList = [
      { id: 'hl-1', isOfficial: true, text: "Note d'auteur", upvotes: [] },
      { id: 'hl-2', isPublic: true, text: 'Annotation communauté', upvotes: [{ id: 'up-1' }] },
    ];
    (prisma.highlight.findMany as unknown as Mock).mockResolvedValue(mockList);

    const res = await getArticleHighlights('art-1', 'user-1');

    expect(prisma.highlight.findMany).toHaveBeenCalled();
    expect(res[0].hasUpvoted).toBe(false);
    expect(res[1].hasUpvoted).toBe(true);
  });
});
