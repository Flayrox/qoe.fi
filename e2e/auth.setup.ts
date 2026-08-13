import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ context }) => {
  // Mock Supabase auth token cookie for local/test server bypass
  const mockToken = {
    access_token: 'sb-mock-access-token-e2e',
    refresh_token: 'sb-mock-refresh-token-e2e',
    user: {
      id: 'seeded-creator-user-id',
      email: 'creator@qoe.fi',
      user_metadata: { username: 'creator' },
    },
  };

  const domain = 'localhost';
  await context.addCookies([
    {
      name: 'sb-qoe-auth-token',
      value: JSON.stringify(mockToken),
      domain: domain,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  await context.storageState({ path: authFile });
});
