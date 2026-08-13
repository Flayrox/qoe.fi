import { type User, type Session } from '@supabase/supabase-js';

export const MOCK_USER: User = {
  id: 'test-user-id-12345',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Test Developer', username: 'testdev' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  email: 'test@qoe.fi',
  phone: '',
  role: 'authenticated',
  updated_at: new Date().toISOString(),
};

export const MOCK_SESSION: Session = {
  access_token: 'mocked-jwt-access-token-qoe-fi-test',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mocked-refresh-token-qoe-fi-test',
  user: MOCK_USER,
};

export function createMockSupabaseAuthClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
      getSession: async () => ({ data: { session: MOCK_SESSION }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}
