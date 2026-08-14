import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import { canUserReplyToThought, toggleHideReplyByAuthor } from '../repositories/threadgates';
import { prisma } from '../client';

vi.mock('../client', () => ({
  prisma: {
    thought: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    publication: {
      findFirst: vi.fn(),
    },
    subscriber: {
      findFirst: vi.fn(),
    },
    follows: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('@qoe/db - Threadgates & Moderation Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow author to reply to their own post regardless of restriction', async () => {
    (prisma.thought.findUnique as unknown as Mock).mockResolvedValue({
      authorId: 'author-1',
      replyRestriction: 'subscribers',
      content: 'Hello',
    });

    const res = await canUserReplyToThought('thought-1', 'author-1');
    expect(res).toEqual({ canReply: true, restriction: 'subscribers' });
  });

  it("should allow anyone to reply when restriction is 'everyone'", async () => {
    (prisma.thought.findUnique as unknown as Mock).mockResolvedValue({
      authorId: 'author-1',
      replyRestriction: 'everyone',
      content: 'Hello',
    });

    const res = await canUserReplyToThought('thought-1', 'reader-1');
    expect(res).toEqual({ canReply: true, restriction: 'everyone' });
  });

  it("should restrict replies to active subscribers when restriction is 'subscribers'", async () => {
    (prisma.thought.findUnique as unknown as Mock).mockResolvedValue({
      authorId: 'author-1',
      replyRestriction: 'subscribers',
      content: 'Hello',
    });
    (prisma.publication.findFirst as unknown as Mock).mockResolvedValue({
      id: 'pub-author-1',
      type: 'PERSONAL',
    });
    (prisma.subscriber.findFirst as unknown as Mock).mockResolvedValueOnce(null); // non abonné

    const res1 = await canUserReplyToThought('thought-1', 'reader-1');
    expect(res1.canReply).toBe(false);

    (prisma.subscriber.findFirst as unknown as Mock).mockResolvedValueOnce({ id: 'sub-1' }); // abonné
    const res2 = await canUserReplyToThought('thought-1', 'reader-1');
    expect(res2.canReply).toBe(true);
  });

  it("should restrict replies to mentioned users when restriction is 'mentioned'", async () => {
    (prisma.thought.findUnique as unknown as Mock).mockResolvedValue({
      authorId: 'author-1',
      replyRestriction: 'mentioned',
      content: 'Coucou @alex !',
    });
    (prisma.user.findUnique as unknown as Mock).mockResolvedValue({ username: 'alex' });

    const res = await canUserReplyToThought('thought-1', 'user-alex');
    expect(res.canReply).toBe(true);
  });

  it('should allow original author to toggle hide on a reply', async () => {
    (prisma.thought.findUnique as unknown as Mock).mockResolvedValue({
      id: 'reply-1',
      isHiddenByAuthor: false,
      parent: { authorId: 'author-1' },
    });
    (prisma.thought.update as unknown as Mock).mockResolvedValue({
      id: 'reply-1',
      isHiddenByAuthor: true,
    });

    const res = await toggleHideReplyByAuthor('reply-1', 'author-1');

    expect(prisma.thought.update).toHaveBeenCalledWith({
      where: { id: 'reply-1' },
      data: { isHiddenByAuthor: true },
      select: { id: true, isHiddenByAuthor: true },
    });
    expect(res.isHiddenByAuthor).toBe(true);
  });

  it('should throw error if non-author tries to hide a reply', async () => {
    (prisma.thought.findUnique as unknown as Mock).mockResolvedValue({
      id: 'reply-1',
      isHiddenByAuthor: false,
      parent: { authorId: 'author-1' },
    });

    await expect(toggleHideReplyByAuthor('reply-1', 'stranger-99')).rejects.toThrow(
      "Seul l'auteur de la publication originale peut masquer cette réponse."
    );
  });
});
