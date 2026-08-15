import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3010;
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Démarre le serveur automatiquement (local ou CI), sans dépendre d'un
  // serveur déjà lancé. Réutilise un serveur existant si le port répond.
  webServer: {
    command: 'pnpm --filter @qoe/feed dev',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
      SKIP_ENV_VALIDATION: 'true',
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'public-web',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /public\.spec\.ts/,
    },
    {
      // Suite autonome (page.setContent, sans serveur/DB) — tourne en CI :
      // contrat UI (drawer physics, tenant accent, paywall) sans dépendre
      // de Supabase ni du seed.
      name: 'annotations',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /annotations\.spec\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      testIgnore: /(public|annotations)\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],
});
