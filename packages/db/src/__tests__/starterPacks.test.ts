import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import {
  getStarterPacks,
  getStarterPackById,
  createStarterPack,
  followAllInStarterPack,
} from '../repositories/starterPacks';
import { prisma } from '../client';

vi.mock('../client', () => ({
  prisma: {
    starterPack: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    follows: {
      createMany: vi.fn(),
    },
  },
}));

describe('@qoe/db - StarterPacks Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retrieve starter packs list with pagination cursor', async () => {
    const mockPacks = [
      { id: 'sp-1', title: 'Incontournables Tech', items: [] },
      { id: 'sp-2', title: 'Auteurs Climat', items: [] },
    ];
    (prisma.starterPack.findMany as unknown as Mock).mockResolvedValue(mockPacks);

    const res = await getStarterPacks(20);
    expect(prisma.starterPack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(res.starterPacks).toEqual(mockPacks);
    expect(res.nextCursor).toBeNull();
  });

  it('should retrieve a single starter pack by ID', async () => {
    const mockPack = { id: 'sp-1', title: 'Incontournables Tech', items: [] };
    (prisma.starterPack.findUnique as unknown as Mock).mockResolvedValue(mockPack);

    const res = await getStarterPackById('sp-1');
    expect(prisma.starterPack.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sp-1' } })
    );
    expect(res).toEqual(mockPack);
  });

  it('should create a starter pack with unique items excluding creator', async () => {
    const mockCreated = { id: 'sp-new', title: 'Mon Pack', creatorId: 'creator-1' };
    (prisma.starterPack.create as unknown as Mock).mockResolvedValue(mockCreated);

    const res = await createStarterPack({
      title: 'Mon Pack',
      description: 'Super pack',
      creatorId: 'creator-1',
      userIds: ['creator-1', 'user-2', 'user-3', 'user-2'],
    });

    expect(prisma.starterPack.create).toHaveBeenCalledWith({
      data: {
        title: 'Mon Pack',
        description: 'Super pack',
        icon: '🚀',
        creatorId: 'creator-1',
        items: {
          create: [{ userId: 'user-2' }, { userId: 'user-3' }],
        },
      },
      include: expect.any(Object),
    });
    expect(res).toEqual(mockCreated);
  });

  it('should batch follow all members in a starter pack using followAllInStarterPack', async () => {
    (prisma.starterPack.findUnique as unknown as Mock).mockResolvedValue({
      id: 'sp-1',
      items: [{ userId: 'user-2' }, { userId: 'user-3' }, { userId: 'reader-1' }],
    });
    (prisma.follows.createMany as unknown as Mock).mockResolvedValue({ count: 2 });

    const res = await followAllInStarterPack('reader-1', 'sp-1');

    expect(prisma.follows.createMany).toHaveBeenCalledWith({
      data: [
        { readerId: 'reader-1', creatorId: 'user-2' },
        { readerId: 'reader-1', creatorId: 'user-3' },
      ],
      skipDuplicates: true,
    });
    expect(res).toEqual({ followedCount: 2 });
  });
});
