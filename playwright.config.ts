import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { loadEnv } from './e2e/lib/env';

const localApiEnv = loadEnv(path.join(process.cwd(), 'apps/api/.env'));

const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3010;
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || `http://localhost:${PORT}`;
const GO_API_PORT = Number(process.env.PLAYWRIGHT_GO_API_PORT) || 8090;
const GO_API_URL = `http://localhost:${GO_API_PORT}`;

// DSN sans paramètres réservés à Prisma (?schema=public) : pgx les enverrait
// comme startup parameters (refusés par Postgres).
const goDatabaseUrl = (
  process.env.API_DATABASE_URL ??
  process.env.DATABASE_URL ??
  localApiEnv.API_DATABASE_URL ??
  localApiEnv.DATABASE_URL ??
  ''
).split('?')[0];
const supabaseAuthUrl =
  process.env.SUPABASE_AUTH_URL ??
  localApiEnv.SUPABASE_AUTH_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  localApiEnv.NEXT_PUBLIC_SUPABASE_URL ??
  '';
const supabaseJwtSecret =
  process.env.SUPABASE_JWT_SECRET ??
  localApiEnv.SUPABASE_JWT_SECRET ??
  process.env.SUPABASE_SECRET_KEY ??
  localApiEnv.SUPABASE_SECRET_KEY ??
  'e2e-router-secret';

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
  // Backend-of-record Go (QOE_API_URL) : requis par toutes les pages qui
  // lisent le feed/articles (Prisma retiré). Démarre l'API Go avec la base
  // seedée ; tolère Redis absent (rate-limit pass-through en erreur).
  webServer: [
    {
      command: 'cd apps/api && go run ./cmd/server',
      url: `${GO_API_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        API_PORT: String(GO_API_PORT),
        API_DATABASE_URL: goDatabaseUrl,
        SUPABASE_AUTH_URL: supabaseAuthUrl,
        SUPABASE_JWT_SECRET: supabaseJwtSecret,
        REDIS_URL: process.env.REDIS_URL ?? '',
      },
    },
    {
      // `next dev` SANS -p : le flag du script dev (apps/core: "-p 15402")
      // écraserait PORT env et le readiness check attendrait le mauvais port.
      command: 'pnpm --filter @qoe/core exec next dev',
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: String(PORT),
        HOSTNAME: '127.0.0.1',
        NEXT_TELEMETRY_DISABLED: '1',
        SKIP_ENV_VALIDATION: 'true',
        QOE_API_URL: GO_API_URL,
      },
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'public-web',
      use: { ...devices['Desktop Chrome'] },
      // public.spec.ts (smoke) + public-reading.spec.ts (parcours lecture) —
      // tournent en CI avec le seed + API Go.
      testMatch: /public.*\.spec\.ts/,
    },
    {
      // Parcours lecture public déterministe (article, paywall, 404).
      name: 'core-journeys',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /core-journeys\.spec\.ts/,
    },
    {
      // Campagne de sécurité au niveau HTTP (API Go + apps web).
      name: 'security',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /security\.spec\.ts/,
    },
    {
      // Vraie page de consentement OAuth (apps/core) : rendu + autorisation
      // + redirection avec code/state, puis échange du code contre un token.
      name: 'oauth-consent',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /oauth-consent\.spec\.ts/,
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
      // Parcours réel isolé : la spec crée son propre compte GoTrue et ne
      // dépend pas du cookie mocké de auth.setup.ts.
      name: 'like-privacy',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /like-privacy\.spec\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      // Les specs publics/annotations/journeys/security/like-privacy tournent
      // dans leurs propres projets ; studio/admin/tenants ont leur propre config.
      testIgnore:
        /(public|annotations|core-journeys|security|oauth-consent|like-privacy|studio|admin|tenants)\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],
});
