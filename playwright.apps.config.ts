// =====================================================================
// 🧪 playwright.apps.config.ts — E2E des apps secondaires (tenants,
// studio, admin) contre l'API Go réelle.
// =====================================================================
// Dédié à CI (job e2e-apps) : les specs studio/admin/tenants nécessitent
// l'API Go (QOE_API_URL) + la base seedée. Les parcours authentifiés
// complets (RUN_FULL_STACK=1, Supabase local) restent locaux.
// =====================================================================

import { defineConfig, devices } from '@playwright/test';

const GO_API_PORT = Number(process.env.PLAYWRIGHT_GO_API_PORT) || 8090;
const GO_API_URL = `http://localhost:${GO_API_PORT}`;
const TENANTS_URL = process.env.PLAYWRIGHT_TENANTS_URL ?? 'http://localhost:3001';
const STUDIO_URL = process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:3020';
const ADMIN_URL = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://localhost:3030';

// DSN sans paramètres réservés à Prisma (?schema=public).
const goDatabaseUrl = (process.env.API_DATABASE_URL ?? process.env.DATABASE_URL ?? '').split(
  '?'
)[0];

const appEnv = {
  NEXT_TELEMETRY_DISABLED: '1',
  SKIP_ENV_VALIDATION: 'true',
  QOE_API_URL: GO_API_URL,
};

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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'cd apps/api && go run ./cmd/server',
      url: `${GO_API_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        API_PORT: String(GO_API_PORT),
        API_DATABASE_URL: goDatabaseUrl,
        SUPABASE_AUTH_URL: process.env.SUPABASE_AUTH_URL ?? '',
        SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? 'e2e-router-secret',
        REDIS_URL: process.env.REDIS_URL ?? '',
      },
    },
    {
      // Health-check TCP : la racine de tenants est publique mais les routes
      // de studio/admin redirigent (auth) — le port suffit à attendre le boot.
      command: 'pnpm --filter @qoe/tenants dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...appEnv, PORT: '3001', HOSTNAME: '127.0.0.1' },
    },
    {
      command: 'pnpm --filter @qoe/studio dev',
      port: 3020,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...appEnv, PORT: '3020', HOSTNAME: '127.0.0.1' },
    },
    {
      command: 'pnpm --filter @qoe/admin dev',
      port: 3030,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...appEnv, PORT: '3030', HOSTNAME: '127.0.0.1' },
    },
  ],
  projects: [
    {
      name: 'tenants',
      use: { ...devices['Desktop Chrome'], baseURL: TENANTS_URL },
      testMatch: /tenants\.spec\.ts/,
    },
    {
      name: 'studio',
      use: { ...devices['Desktop Chrome'], baseURL: STUDIO_URL },
      testMatch: /studio\.spec\.ts/,
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
      testMatch: /admin\.spec\.ts/,
    },
  ],
});
