import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const storageMap = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storageMap.get(key) ?? null),
    setItem: vi.fn(async (key: string, val: string) => {
      storageMap.set(key, val);
    }),
    removeItem: vi.fn(async (key: string) => {
      storageMap.delete(key);
    }),
    clear: vi.fn(async () => {
      storageMap.clear();
    }),
  },
}));

import {
  getSavedAccounts,
  saveAccount,
  removeStoredAccount,
  clearAllStoredAccounts,
} from '../accounts-manager';

describe('mobile accounts-manager', () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
  });

  const createMockSession = (userId: string, email: string): Session =>
    ({
      access_token: `acc_${userId}`,
      refresh_token: `ref_${userId}`,
      user: {
        id: userId,
        email,
        user_metadata: {
          name: `User ${userId}`,
          username: `username_${userId}`,
          avatar_url: `https://cdn.qoe.fi/${userId}.png`,
        },
      },
    }) as unknown as Session;

  it('getSavedAccounts returns empty array when storage is empty or invalid JSON', async () => {
    expect(await getSavedAccounts()).toEqual([]);

    storageMap.set('qoe_saved_accounts_v1', 'not-valid-json');
    expect(await getSavedAccounts()).toEqual([]);

    storageMap.set('qoe_saved_accounts_v1', '{"not":"an array"}');
    expect(await getSavedAccounts()).toEqual([]);
  });

  it('saveAccount saves a new account with extracted metadata', async () => {
    const session = createMockSession('usr_1', 'alice@qoe.fi');
    const accounts = await saveAccount(session);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: 'usr_1',
      email: 'alice@qoe.fi',
      name: 'User usr_1',
      username: 'username_usr_1',
      avatarUrl: 'https://cdn.qoe.fi/usr_1.png',
      refreshToken: 'ref_usr_1',
      accessToken: 'acc_usr_1',
    });
    expect(typeof accounts[0].lastUsedAt).toBe('number');

    const retrieved = await getSavedAccounts();
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].id).toBe('usr_1');
  });

  it('saveAccount uses email fallbacks when metadata is absent', async () => {
    const rawSession = {
      access_token: 'acc_2',
      refresh_token: 'ref_2',
      user: {
        id: 'usr_2',
        email: 'bob.writer@qoe.fi',
        user_metadata: {},
      },
    } as unknown as Session;

    const accounts = await saveAccount(rawSession);
    expect(accounts[0].name).toBe('bob.writer');
    expect(accounts[0].username).toBe('bob.writer');
    expect(accounts[0].avatarUrl).toBeNull();
  });

  it('saveAccount updates existing account without duplicating it', async () => {
    const session1 = createMockSession('usr_1', 'alice@qoe.fi');
    await saveAccount(session1);

    const updatedSession = {
      ...session1,
      access_token: 'new_acc_1',
      refresh_token: 'new_ref_1',
    } as unknown as Session;

    const accounts = await saveAccount(updatedSession, {
      name: 'Alice Updated',
      isCertified: true,
    });

    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('Alice Updated');
    expect(accounts[0].accessToken).toBe('new_acc_1');
    expect(accounts[0].isCertified).toBe(true);
  });

  it('saveAccount sorts accounts by lastUsedAt descending', async () => {
    const session1 = createMockSession('usr_1', 'alice@qoe.fi');
    const session2 = createMockSession('usr_2', 'bob@qoe.fi');

    await saveAccount(session1);
    // Small delay to guarantee different lastUsedAt timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));
    const accounts = await saveAccount(session2);

    expect(accounts).toHaveLength(2);
    expect(accounts[0].id).toBe('usr_2');
    expect(accounts[1].id).toBe('usr_1');
    expect(accounts[0].lastUsedAt).toBeGreaterThanOrEqual(accounts[1].lastUsedAt);
  });

  it('removeStoredAccount removes only specified account', async () => {
    const session1 = createMockSession('usr_1', 'alice@qoe.fi');
    const session2 = createMockSession('usr_2', 'bob@qoe.fi');

    await saveAccount(session1);
    await saveAccount(session2);

    const remaining = await removeStoredAccount('usr_1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('usr_2');

    const inStorage = await getSavedAccounts();
    expect(inStorage).toHaveLength(1);
    expect(inStorage[0].id).toBe('usr_2');
  });

  it('clearAllStoredAccounts clears all accounts', async () => {
    const session = createMockSession('usr_1', 'alice@qoe.fi');
    await saveAccount(session);

    await clearAllStoredAccounts();
    expect(await getSavedAccounts()).toEqual([]);
  });

  it('saveAccount returns current accounts if session is invalid', async () => {
    const emptySession = {} as unknown as Session;
    const res = await saveAccount(emptySession);
    expect(res).toEqual([]);
  });
});
