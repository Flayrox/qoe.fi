import { describe, expect, it, vi, type Mock } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import { findByEmail, findById, findByUsername } from '../repositories/users';
import { prisma } from '../client';

vi.mock('../client', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('@qoe/db - Users Repository', () => {
  it('should call prisma.user.findUnique with email', async () => {
    const mockUser = { id: 'u-1', email: 'test@qoe.fi', username: 'testuser' };
    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(mockUser);

    const result = await findByEmail('test@qoe.fi');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@qoe.fi' } });
    expect(result).toEqual(mockUser);
  });

  it('should call prisma.user.findUnique with id', async () => {
    const mockUser = { id: 'u-1', email: 'test@qoe.fi' };
    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(mockUser);

    const result = await findById('u-1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u-1' } });
    expect(result).toEqual(mockUser);
  });

  it('should call prisma.user.findUnique with username selection', async () => {
    (prisma.user.findUnique as unknown as Mock).mockResolvedValue({
      id: 'u-1',
      username: 'alex',
      publication: { heroText: null, headerImageUrl: null, subdomain: null },
    });

    const result = await findByUsername('alex');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'alex' },
      include: { publication: true },
    });
    expect(result).toEqual({
      id: 'u-1',
      username: 'alex',
      publication: { heroText: null, headerImageUrl: null, subdomain: null },
      heroText: null,
      headerImageUrl: null,
      subdomain: null,
    });
  });
});
