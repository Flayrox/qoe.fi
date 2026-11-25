import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { resolveSupabaseUrl } from '@qoe/supabase/url';
import { loadEnv } from './e2e/lib/env';

const localApiEnv = loadEnv(path.join(process.cwd(), 'apps/api/.env'));

const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3010;
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || `http://localhost:${PORT}`;
const GO_API_PORT = Number(process.env.PLAYWRIGHT_GO_API_PORT) || 8090;
const GO_API_URL = `http://localhost:${GO_API_PORT}`;
// Mode « prod » de la matrice : sert le build (`next start`) au lieu de
// `next dev`. Trois `next dev` + l'API + Chromium dépassaient la mémoire du
// runner (job tué à ~6 min, deux fois) ; un build supprime les compilateurs.
// Activé par le job `e2e-routes`, qui construit core et admin avant.
const ROUTES_PROD = process.env.PLAYWRIGHT_ROUTES_PROD === '1';

// DSN sans paramètres réservés à Prisma (?schema=public) : pgx les enverrait
// comme startup parameters (refusés par Postgres).
const goDatabaseUrl = (
  process.env.API_DATABASE_URL ??
  process.env.DATABASE_URL ??
  localApiEnv.API_DATABASE_URL ??
  localApiEnv.DATABASE_URL ??
  ''
).split('?')[0];
// Même règle d'origine que l'application et l'API Go : l'API Go lancée par
// Playwright reçoit une origine locale, jamais le Supabase d'un `.env` de poste.
const supabaseAuthUrl = resolveSupabaseUrl(
  process.env.SUPABASE_AUTH_URL ??
    localApiEnv.SUPABASE_AUTH_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    localApiEnv.NEXT_PUBLIC_SUPABASE_URL ??
    '',
  process.env.NEXT_PUBLIC_APP_URL
);
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
  workers: process.env.CI ? 2 : undefined,
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
      // Les migrations sont appliquées par le serveur lui-même avant de
      // démarrer : en local, `pnpm e2e` ne doit jamais parler à une base non
      // migrée (erreur `goose_db_version` incompréhensible), et l'API lit
      // explicitement la même base que les fixtures (aucun `.env` implicite).
      command: 'cd apps/api && go run ./cmd/migrate -dir sql/migrations up && go run ./cmd/server',
      url: `${GO_API_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        API_PORT: String(GO_API_PORT),
        API_DATABASE_URL: goDatabaseUrl,
        DATABASE_URL: goDatabaseUrl,
        SUPABASE_AUTH_URL: supabaseAuthUrl,
        SUPABASE_JWT_SECRET: supabaseJwtSecret,
        REDIS_URL: process.env.REDIS_URL ?? '',
      },
    },
    // La vitrine `hi` sert la page publique `/legal/:slug` vérifiée par le
    // parcours admin-legal complet (`RUN_FULL_STACK=1`). Elle n'est montée que
    // dans ce régime : les jobs CI sans stack complète n'ont pas de build hi.
    ...(process.env.RUN_FULL_STACK === '1'
      ? [
          {
            command:
              "pnpm --filter @qoe/hi exec sh -c 'rm -f .next/dev/lock && exec next start -p 15401 -H 127.0.0.1'",
            url: 'http://127.0.0.1:15401/',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              NEXT_TELEMETRY_DISABLED: '1',
              SKIP_ENV_VALIDATION: 'true',
              HOSTNAME: '127.0.0.1',
              QOE_API_URL: GO_API_URL,
            },
          },
        ]
      : []),
    {
      // `next dev` SANS -p : le flag du script dev (apps/core: "-p 15402")
      // écraserait PORT env et le readiness check attendrait le mauvais port.
      command: ROUTES_PROD
        ? 'pnpm --filter @qoe/core exec next start'
        : 'pnpm --filter @qoe/core exec next dev',
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
    {
      // 🛡️ Console admin (apps/admin) : requise par admin-legal.spec.ts
      // (RUN_FULL_STACK=1). Le middleware canonicalise localhost →
      // admin.lvh.me : la spec navigue directement sur admin.lvh.me:15405.
      command: ROUTES_PROD
        ? 'pnpm --filter @qoe/admin exec next start'
        : 'pnpm --filter @qoe/admin exec next dev',
      port: 15405,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: '15405',
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
      // Campagne de sécurité au niveau HTTP (API Go + apps web) + RFC 8058.
      name: 'security',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(security|newsletter)\.spec\.ts/,
    },
    {
      // 🚦 Coupure globale de l'API (kill switch + endpoints désactivés).
      // Les bascules sont GLOBALES (`SystemConfig`) et le middleware les
      // applique à TOUS les appels `/v1/*` de la fenêtre : les faire tourner
      // en parallèle du projet `security` produisait des 503 chez lui
      // (mesuré : `security.spec.ts:38` 401 → 503) et des 404 en cascade
      // (`/article/<slug>` 308 → 404, `goFetch` ayant reçu 503). Le cache
      // interne (~5 s) prolonge la fenêtre au-delà du `afterAll`. Projet
      // isolé, lancé SEUL (étape dédiée du job `e2e`) : plus aucun cas
      // concurrent ne subit la coupure.
      name: 'api-access-control',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /api-access-control\.spec\.ts/,
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
      // contrat UI (drawer physics, tenant accent, paywall, studio distribution)
      // sans dépendre de Supabase ni du seed.
      name: 'standalone-contracts',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(annotations|studio-newsletter-distribution)\.spec\.ts/,
    },
    {
      // Parcours réel isolé : la spec crée son propre compte GoTrue et ne
      // dépend pas du cookie mocké de auth.setup.ts.
      name: 'like-privacy',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /like-privacy\.spec\.ts/,
    },
    {
      // ⚖️ Cycle de vie d'un document légal dans la console admin :
      // brouillon → avertissement placeholder → publication → page publique.
      // Le parcours complet est gated RUN_FULL_STACK=1 (session GoTrue
      // réelle) ; le gate d'authentification tourne partout.
      name: 'admin-legal',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /admin-legal\.spec\.ts/,
    },
    {
      // 🧬 Garde-fou d'hydratation : échoue si le HTML SSR et le premier
      // rendu client divergent (React #418/#423/#425). Pages publiques, sans
      // session — c'est exactement le trou qui a laissé passer /pricing.
      name: 'hydration',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /hydration\.spec\.ts/,
    },
    {
      // 🗺️ Matrice de routes : rend CHAQUE page core + admin découverte sur
      // le disque, et échoue si une page n'est ni visitée ni exemptée.
      // C'est la couverture « 100 % des pages » qui manquait.
      name: 'routes',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /routes\.spec\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      // Ce projet est le « reste » du dépôt : UNIQUEMENT les specs qui n'ont
      // pas de projet dédié. L'ancien `testIgnore` par sous-chaîne ne filtrait
      // presque rien (il exigeait `<mot>.spec.ts` en entier) : ce projet jouait
      // donc 91 cas — les apps (studio/tenants/hi), le parcours studio
      // authentifié et la suite visuelle — hors de leur stack et avec une
      // session mockée. Une liste positive ne peut pas « fuiter » : tout
      // nouveau spec doit choisir son projet.
      testMatch: /(connected-feed-capture|creator-slugs|smoke|smoke-zero-crash)\.spec\.ts$/,
      dependencies: ['setup'],
    },
  ],
});
