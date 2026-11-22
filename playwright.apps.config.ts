// =====================================================================
// 🧪 playwright.apps.config.ts — E2E des apps secondaires (tenants,
// studio, admin) contre l'API Go réelle.
// =====================================================================
// Dédié à CI (job e2e-apps) : les specs studio/admin/tenants nécessitent
// l'API Go (QOE_API_URL) + la base seedée. Les parcours authentifiés
// complets (RUN_FULL_STACK=1, Supabase local) restent locaux.
// =====================================================================

import { defineConfig, devices } from '@playwright/test';
import { resolveSupabaseUrl } from '@qoe/supabase/url';

const GO_API_PORT = Number(process.env.PLAYWRIGHT_GO_API_PORT) || 8090;
// ⚠️ `127.0.0.1`, pas `localhost` : sur macOS `localhost` résout d'abord en
// `::1` et le health-check échouait en `ECONNREFUSED ::1:8090` alors que l'API
// Go écoutait en IPv4 (attente infinie du webServer, run annulé).
const GO_API_URL = `http://127.0.0.1:${GO_API_PORT}`;
// Les apps hardcodent leurs ports dev (next dev -p 15403/15404/15405 — le
// flag CLI prime sur la variable PORT) : Playwright doit attendre CES ports,
// pas des ports libres arbitraires.
const TENANTS_URL = process.env.PLAYWRIGHT_TENANTS_URL ?? 'http://localhost:15403';
const STUDIO_URL = process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:15404';
const ADMIN_URL = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://localhost:15405';
const HI_URL = process.env.PLAYWRIGHT_HI_URL ?? 'http://localhost:15401';

// DSN sans paramètres réservés à Prisma (?schema=public).
const goDatabaseUrl = (process.env.API_DATABASE_URL ?? process.env.DATABASE_URL ?? '').split(
  '?'
)[0];

// Même règle d'origine que l'application (`@qoe/supabase/url`) : l'API Go
// lancée ici ne doit jamais recevoir le Supabase d'un `.env` de poste. Un
// `SUPABASE_AUTH_URL` passé brut pointait le VPS partagé.
const supabaseAuthUrl = resolveSupabaseUrl(
  process.env.SUPABASE_AUTH_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_APP_URL
);

const appEnv = {
  NEXT_TELEMETRY_DISABLED: '1',
  SKIP_ENV_VALIDATION: 'true',
  QOE_API_URL: GO_API_URL,
  // Le banc /dev/editor-check de studio est un rendu dynamique : il lit ce
  // drapeau AU RENDU, donc le serveur `next start` doit le recevoir aussi.
  ...(process.env.QOE_E2E_DEV_ROUTES ? { QOE_E2E_DEV_ROUTES: process.env.QOE_E2E_DEV_ROUTES } : {}),
};

// Mode « prod » : sert le build (`next start`) au lieu de `next dev`. En dev,
// chaque première visite compile sa route — la matrice de 42 pages dépassait
// les 20 min de budget CI et se faisait annuler. Avec un build, une page
// répond en millisecondes. Activé par le job `e2e-apps-routes`, qui construit
// les deux apps avant de lancer la matrice.
const APP_PROD = process.env.PLAYWRIGHT_APPS_PROD === '1';
const hasProjectArg = process.argv.some((a) => a.startsWith('--project'));
const NEEDS_TENANTS = !hasProjectArg || process.argv.some((a) => a.includes('tenants'));
const NEEDS_STUDIO = !hasProjectArg || process.argv.some((a) => a.includes('studio'));
const NEEDS_HI = !hasProjectArg || process.argv.some((a) => a.includes('hi'));
const NEEDS_ADMIN = !hasProjectArg || process.argv.some((a) => a.includes('admin'));

// Parcours authentifié complet (`RUN_FULL_STACK=1`) : le formulaire de login vit
// dans le core (seule surface qui instancie le client Supabase navigateur).
// Sans core, studio redirige vers `lvh.me:3010` et le login réel est impossible.
// ⚠️ Hôte et port canoniques : `apps/studio/middleware.ts` réécrit
// `localhost:15404` → `studio.lvh.me:15404`, et les apps redirigent vers le
// core sur `lvh.me:15402`. Un core sur un autre port rend le parcours
// impossible (`ERR_CONNECTION_REFUSED` sur `lvh.me:15402`) ; le cookie de
// session, lui, est posé sur `.lvh.me` et suit donc les sous-domaines.
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';
/**
 * 🔐 Uniquement posé par `scripts/e2e-studio-auth.mjs`, qui a monté l'infra
 * jetable (Postgres/Redis/GoTrue) et construit les apps. Jamais par un run
 * d'apps ordinaire, même sous `RUN_FULL_STACK=1`.
 */
const STUDIO_AUTH_JOURNEY = process.env.STUDIO_AUTH_JOURNEY === '1';
const CORE_URL = process.env.PLAYWRIGHT_CORE_URL ?? 'http://lvh.me:15402';
const CORE_PORT = Number(new URL(CORE_URL).port) || 15402;

/**
 * Toutes les apps passent par ici : aucune n'a de commande `next dev` à elle,
 * donc `PLAYWRIGHT_APPS_PROD=1` reste l'unique bascule de régime (le job CI
 * `e2e-apps` le pose pour tenants, studio **et** admin). Le build de chaque app
 * est produit par la même commande que dans ce job :
 * `pnpm intl:compile && pnpm --filter @qoe/<app> build`.
 *
 * ⚠️ Readiness HTTP (`url`), pas `port` : le port s'ouvre avant que Next ne
 * serve — Playwright naviguait alors dans le vide et la spec échouait en
 * `ERR_CONNECTION_REFUSED` alors que le serveur démarrait correctement.
 * Next accepte aussi les 3xx (studio/admin redirigent vers /login), donc le
 * health-check passe même sur une route protégée.
 */
function appServer(
  pkg: string,
  port: number,
  options: { prod?: boolean; url?: string; timeout?: number } = {}
) {
  const prod = options.prod ?? APP_PROD;
  // `rm -f .next/dev/lock` : Next 16 refuse un second `next dev` dans le même
  // dossier, et le verrou survit à l'arrêt brutal du serveur par Playwright.
  // Sans ce nettoyage, la run suivante n'imprime rien et expire en
  // « Timed out waiting 120000ms from config.webServer ».
  const launch = prod ? `next start -p ${port} -H 127.0.0.1` : `next dev -p ${port} -H 127.0.0.1`;
  return {
    command: `pnpm --filter ${pkg} exec sh -c 'rm -f .next/dev/lock && exec ${launch}'`,
    // Readiness TCP par défaut, pas HTTP : les racines de studio/admin
    // répondent 307 vers le core (`lvh.me:3010`), et le health-check HTTP
    // **suit** la redirection → `ECONNREFUSED` sur le core → « disponible =
    // false » → Playwright relance une instance alors que le port écoute déjà
    // (`EADDRINUSE`). Une app qui expose une page publique stable (core
    // `/login`) peut demander `url` pour attendre un vrai rendu.
    ...(options.url ? { url: options.url } : { port }),
    reuseExistingServer: !process.env.CI,
    timeout: options.timeout ?? 120_000,
    env: { ...appEnv, HOSTNAME: '127.0.0.1' },
  };
}

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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // Même contrat que `playwright.config.ts` : migrations appliquées par le
      // serveur lui-même, et DSN explicite identique pour l'API et les fixtures
      // (aucun `.env` local implicite, aucune base non migrée).
      command: 'cd apps/api && go run ./cmd/migrate -dir sql/migrations up && go run ./cmd/server',
      url: `${GO_API_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        API_PORT: String(GO_API_PORT),
        API_DATABASE_URL: goDatabaseUrl,
        DATABASE_URL: goDatabaseUrl,
        SUPABASE_AUTH_URL: supabaseAuthUrl,
        SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? 'e2e-router-secret',
        REDIS_URL: process.env.REDIS_URL ?? '',
      },
    },
    // Health-check TCP : la racine de tenants est publique mais les routes
    // de studio/admin redirigent (auth) — le port suffit à attendre le boot.
    ...(NEEDS_TENANTS ? [appServer('@qoe/tenants', 15403)] : []),
    ...(NEEDS_STUDIO ? [appServer('@qoe/studio', 15404)] : []),
    ...(NEEDS_ADMIN ? [appServer('@qoe/admin', 15405)] : []),
    ...(NEEDS_HI ? [appServer('@qoe/hi', 15401)] : []),
    // Core du parcours authentifié : même fabrique que les autres apps, donc
    // même régime de preuve (`PLAYWRIGHT_APPS_PROD=1` → `next start`). Le
    // portage en dur sur `next dev` faisait tourner la preuve réseau du studio
    // sur des artefacts différents de ceux servis ailleurs.
    ...(RUN_FULL_STACK
      ? [appServer('@qoe/core', CORE_PORT, { url: `${CORE_URL}/login`, timeout: 180_000 })]
      : []),
  ],
  projects: [
    {
      name: 'tenants',
      use: { ...devices['Desktop Chrome'], baseURL: TENANTS_URL },
      testMatch: [/tenants\.spec\.ts/, /tenants-.*\.spec\.ts/],
    },
    {
      name: 'studio',
      use: { ...devices['Desktop Chrome'], baseURL: STUDIO_URL },
      testMatch: [/studio\.spec\.ts/, /studio-.*\.spec\.ts/],
      // Le parcours studio authentifié a UN SEUL point d'entrée :
      // `pnpm e2e:studio-auth` (scripts/e2e-studio-auth.mjs), qui monte lui-même
      // Postgres/Redis/GoTrue jetables, lance le spec puis démonte tout. Il n'est
      // donc collecté QUE sur le drapeau explicite que ce script pose
      // (`STUDIO_AUTH_JOURNEY=1`) : `RUN_FULL_STACK=1` le rendait visible dans un
      // run d'apps ordinaire, où il tournait sans l'infra qu'il exige (échec
      // garanti) en plus d'être dupliqué par le script dédié.
      testIgnore: STUDIO_AUTH_JOURNEY ? [] : [/studio-auth-journey\.spec\.ts/],
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
      // admin-legal.spec.ts has its own full-stack gate and legal-lifecycle setup;
      // keep it out of the plain admin smoke project.
      testMatch: [/admin\.spec\.ts/],
    },
    {
      name: 'hi',
      use: { ...devices['Desktop Chrome'], baseURL: HI_URL },
      testMatch: [/hi-.*\.spec\.ts/],
    },
  ],
});
