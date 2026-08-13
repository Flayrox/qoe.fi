import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import { createPollForThought, getPollByThoughtId, votePoll } from '../repositories/polls';
import { prisma } from '../client';

vi.mock('../client', () => ({
  prisma: {
    poll: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    pollVote: {
      create: vi.fn(),
    },
  },
}));

describe('@qoe/db - Polls Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a poll with 2 to 4 options', async () => {
    const mockCreated = { id: 'poll-1', thoughtId: 'thought-1', options: [] };
    (prisma.poll.create as unknown as Mock).mockResolvedValue(mockCreated);

    const res = await createPollForThought({
      thoughtId: 'thought-1',
      options: ['Option A', 'Option B', 'Option C'],
      durationHours: 24,
    });

    expect(prisma.poll.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        thoughtId: 'thought-1',
        options: {
          create: [
            { text: 'Option A', order: 0 },
            { text: 'Option B', order: 1 },
            { text: 'Option C', order: 2 },
          ],
        },
      }),
      include: expect.any(Object),
    });
    expect(res).toEqual(mockCreated);
  });

  it('should throw an error if poll options are less than 2', async () => {
    await expect(
      createPollForThought({
        thoughtId: 'thought-1',
        options: ['Seule option'],
      })
    ).rejects.toThrow('Un sondage doit contenir entre 2 et 4 options.');
  });

  it('should calculate percentages and user vote status in getPollByThoughtId', async () => {
    const mockPoll = {
      id: 'poll-1',
      thoughtId: 'thought-1',
      expiresAt: new Date(Date.now() + 3600000), // expiré dans 1h
      options: [
        { id: 'opt-1', text: 'Oui', order: 0, _count: { votes: 3 } },
        { id: 'opt-2', text: 'Non', order: 1, _count: { votes: 1 } },
      ],
      votes: [{ optionId: 'opt-1' }],
    };
    (prisma.poll.findUnique as unknown as Mock).mockResolvedValue(mockPoll);

    const res = await getPollByThoughtId('thought-1', 'user-1');

    expect(res).not.toBeNull();
    expect(res?.totalVotes).toBe(4);
    expect(res?.isExpired).toBe(false);
    expect(res?.userVotedOptionId).toBe('opt-1');
    expect(res?.options[0].percentage).toBe(75);
    expect(res?.options[1].percentage).toBe(25);
  });

  it('should record a vote and return updated poll results', async () => {
    (prisma.poll.findUnique as unknown as Mock).mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + 3600000),
      thoughtId: 'thought-1',
    });
    (prisma.pollVote.create as unknown as Mock).mockResolvedValue({ id: 'vote-1' });

    // Deuxième findUnique dans getPollByThoughtId
    (prisma.poll.findUnique as unknown as Mock).mockResolvedValueOnce({
      id: 'poll-1',
      thoughtId: 'thought-1',
      expiresAt: new Date(Date.now() + 3600000),
      options: [{ id: 'opt-1', text: 'Oui', order: 0, _count: { votes: 1 } }],
      votes: [{ optionId: 'opt-1' }],
    });

    const res = await votePoll({
      pollId: 'poll-1',
      optionId: 'opt-1',
      userId: 'user-1',
    });

    expect(prisma.pollVote.create).toHaveBeenCalledWith({
      data: { pollId: 'poll-1', optionId: 'opt-1', userId: 'user-1' },
    });
    expect(res?.userVotedOptionId).toBe('opt-1');
  });
});
