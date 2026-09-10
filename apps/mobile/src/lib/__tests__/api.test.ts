import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  isDevice: false,
  expoConfig: { hostUri: undefined as string | undefined },
  platformOS: 'ios' as 'ios' | 'android' | 'web',
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('expo-device', () => ({
  get isDevice() {
    return mocks.isDevice;
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return mocks.expoConfig;
    },
  },
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platformOS;
    },
    select: (obj: Record<string, unknown>) => obj[mocks.platformOS] ?? obj.default,
  },
}));

vi.mock('@/lib/session', () => ({
  getAccessToken: mocks.getAccessToken,
  setAccessToken: mocks.setAccessToken,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

import { getApiBaseUrl, apiClient } from '../api';

describe('mobile api config & apiClient', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_API_URL;
    mocks.isDevice = false;
    mocks.platformOS = 'ios';
    mocks.expoConfig.hostUri = undefined;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.EXPO_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.EXPO_PUBLIC_API_URL;
    }
  });

  describe('getApiBaseUrl', () => {
    it('returns configured EXPO_PUBLIC_API_URL with trailing slash trimmed', () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.qoe.fi/';
      expect(getApiBaseUrl()).toBe('https://api.qoe.fi');
    });

    it('rewrites localhost to 10.0.2.2 on Android emulator when EXPO_PUBLIC_API_URL is local', () => {
      mocks.platformOS = 'android';
      mocks.isDevice = false;
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8090';

      expect(getApiBaseUrl()).toBe('http://10.0.2.2:8090');

      process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:8090/';
      expect(getApiBaseUrl()).toBe('http://10.0.2.2:8090');
    });

    it('resolves Metro host on physical device via Constants.expoConfig.hostUri', () => {
      mocks.isDevice = true;
      mocks.expoConfig.hostUri = '192.168.1.42:8081';

      expect(getApiBaseUrl()).toBe('http://192.168.1.42:8090');
    });

    it('resolves 10.0.2.2 on Android emulator when EXPO_PUBLIC_API_URL is unset', () => {
      mocks.platformOS = 'android';
      mocks.isDevice = false;

      expect(getApiBaseUrl()).toBe('http://10.0.2.2:8090');
    });

    it('resolves localhost on Web platform', () => {
      mocks.platformOS = 'web';
      expect(getApiBaseUrl()).toBe('http://localhost:8090');
    });

    it('resolves localhost on iOS simulator default', () => {
      mocks.platformOS = 'ios';
      mocks.isDevice = false;
      expect(getApiBaseUrl()).toBe('http://localhost:8090');
    });
  });

  describe('apiClient auth token retrieval', () => {
    it('returns cached in-memory token when present', async () => {
      mocks.getAccessToken.mockReturnValue('cached_jwt_token');

      // The apiClient was instantiated with getAuthToken callback
      const token = await (apiClient as any).getAuthToken?.();

      expect(token).toBe('cached_jwt_token');
      expect(mocks.getSession).not.toHaveBeenCalled();
    });

    it('fetches session token from Supabase when in-memory token is absent', async () => {
      mocks.getAccessToken.mockReturnValue(null);
      mocks.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'fresh_supabase_jwt',
          },
        },
      });

      const token = await (apiClient as any).getAuthToken?.();

      expect(token).toBe('fresh_supabase_jwt');
      expect(mocks.setAccessToken).toHaveBeenCalledWith('fresh_supabase_jwt');
    });

    it('returns null when Supabase session is missing or throws', async () => {
      mocks.getAccessToken.mockReturnValue(null);
      mocks.getSession.mockRejectedValue(new Error('Session error'));

      const token = await (apiClient as any).getAuthToken?.();

      expect(token).toBeNull();
    });
  });
});
