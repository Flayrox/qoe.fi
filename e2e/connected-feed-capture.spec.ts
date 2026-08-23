// =====================================================================
// 🎯 E2E — Capture du feed (lecteur CONNECTÉ, vrai utilisateur Supabase)
// =====================================================================
// Contrairement à auth.setup.ts (cookie mocké, rejeté par le JWT Go),
// ce spec crée un VRAI utilisateur dans le Supabase local (signup +
// confirmation email via service role), insère sa ligne « User » dans la
// base de l'app, puis navigue avec une session réelle. Le JWT est donc
// accepté par le backend Go (signature HS256/JWKS) et dbUser est résolu
// côté app → le menu « Voir moins » des pensées est câblé.
//
// Vérifie deux parcours connectés de bout en bout (navigateur → Next →
// Go → DB) :
//   1. « Voir moins de contenu comme ça » (menu trois points d'une pensée)
//      part réellement au navigateur (POST /api/feed/show-less → Go, 200)
//      et écrit bien une ligne ContentFeedback en base (assertion pg).
//   2. Une lecture réelle au navigateur (page article) est captée
//      (POST /api/analytics/reading-session → Go, 200, ligne ReadingSession
//      en base) et la page « Historique » la rend via
//      GET /v1/me/reading-history (Go).
//
// Prérequis : Supabase local (:54321) + qoe-server Go (QOE_API_URL) +
// base seedée — comme public-feed-capture.spec.ts.
// =====================================================================

import { test, expect, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// ── Env local (apps/api/.env) ────────────────────────────────────────────
function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"\n]*)"?$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv(path.join(process.cwd(), 'apps/api/.env'));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DATABASE_URL = env.DATABASE_URL ?? '';
// supabase-js dérive le nom du cookie : `sb-<hostname.split('.')[0]>-auth-token`.
const COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const EMAIL = `e2e.connected.${Date.now()}@qoe.fi`;
const PASSWORD = 'e2e-pass-123!';

test.describe('Capture du feed (connecté)', () => {
  // Mode serial : tout le describe tourne sur UN seul worker, beforeAll une
  // seule fois — évite la collision de username entre deux workers parallèles.
  test.describe.configure({ mode: 'serial' });

  let userId = '';
  let sessionCookieValue = '';
  let db: Client | null = null;

  // Pose la session réelle (purge d'abord tout cookie sb-* existant — y
  // compris le mock d'auth.setup.ts, dont le token serait rejeté par le Go).
  async function applySessionCookie(context: BrowserContext): Promise<void> {
    await context.clearCookies();
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: sessionCookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
  }

  test.beforeAll(async () => {
    expect(SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL requis').toBeTruthy();
    expect(ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY requis').toBeTruthy();
    expect(SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY requis').toBeTruthy();
    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();

    // 1. Signup (créé le user côté GoTrue/Supabase auth).
    const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const signupBody = (await signup.json()) as { user?: { id: string }; id?: string };
    userId = signupBody.user?.id ?? signupBody.id ?? '';
    expect(userId, 'le signup doit renvoyer un user id').toBeTruthy();

    // 2. Confirmation email via service role (Supabase local : confirmation requise).
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_confirm: true }),
    });

    // 3. Session réelle (grant_type=password) → token accepté par le Go.
    const tok = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const tokBody = (await tok.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      user?: unknown;
    };
    expect(tokBody.access_token, 'le password grant doit émettre un access_token').toBeTruthy();
    const expiresAt = Math.floor(Date.now() / 1000) + (tokBody.expires_in ?? 3600);
    sessionCookieValue = JSON.stringify({
      access_token: tokBody.access_token,
      refresh_token: tokBody.refresh_token,
      expires_at: expiresAt,
      user: tokBody.user ?? { id: userId },
    });

    // 4. Ligne « User » de l'app (id = sub du JWT) — sans elle, dbUser est
    //    null côté app et le menu « Voir moins » n'est pas câblé.
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    await db.query(
      `INSERT INTO "User" (id, email, username, name, role, "hasCompletedOnboarding", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'user', true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [userId, EMAIL, `e2e-${Date.now()}`, 'Lecteur E2E']
    );
  });

  test.afterAll(async () => {
    await db?.end();
  });

  test('« Voir moins » d’une pensée écrit réellement en base via le navigateur', async ({
    page,
  }) => {
    const showLessResponses: number[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/feed/show-less')) showLessResponses.push(res.status());
    });

    await applySessionCookie(page.context());
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Le feed a rendu des cartes.
    await expect(page.locator('article').first()).toBeVisible({ timeout: 30_000 });

    // 2. Une pensée (carte avec menu « Options ») existe et le menu s'ouvre —
    //    il n'apparaît que si dbUser est résolu (onHidePost câblé).
    const thought = page.locator('article:has(button[title="Options"])').first();
    await expect(thought).toBeVisible({ timeout: 30_000 });
    await thought.locator('button[title="Options"]').click();

    const showLess = page.getByText('Voir moins de contenu comme ça').first();
    await expect(showLess).toBeVisible({ timeout: 10_000 });
    await showLess.click();

    // 3. L'appel part (POST /api/feed/show-less → Go) et est accepté (200).
    await expect.poll(() => showLessResponses.length, { timeout: 20_000 }).toBeGreaterThan(0);
    for (const status of showLessResponses) {
      expect(status).toBe(200);
    }

    // 4. La donnée est réellement en base : une ligne ContentFeedback SHOW_LESS.
    await expect
      .poll(
        async () => {
          const { rows } = await db!.query<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM "ContentFeedback"
             WHERE "userId" = $1 AND type = 'SHOW_LESS'`,
            [userId]
          );
          return rows[0].n;
        },
        { timeout: 20_000 }
      )
      .toBeGreaterThan(0);
  });

  test('la page Historique rend les lectures captées par le navigateur via l’endpoint Go', async ({
    page,
  }) => {
    await applySessionCookie(page.context());

    // Un article public seedé, pour une lecture déterministe (le feed est
    // stochastique — on ne dépend pas de sa composition).
    const { rows } = await db!.query<{ slug: string }>(
      `SELECT slug FROM "Article"
       WHERE status = 'PUBLISHED' AND published = true AND visibility = 'PUBLIC'
       ORDER BY "createdAt" DESC LIMIT 1`
    );
    const slug = rows[0]?.slug;
    expect(slug, 'un article public seedé est requis').toBeTruthy();

    // 1. Lecteur neuf → historique vide (état initial).
    await page.goto('/history', { waitUntil: 'networkidle' });
    await expect(page.getByText('Aucune lecture ces 14 derniers jours.')).toBeVisible({
      timeout: 30_000,
    });

    // 2. Lire un article au navigateur (page autonome) → la session de
    //    lecture part au démontage (sendBeacon → Go, 200) et écrit en base.
    await page.goto(`/article/${slug}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#article-content')).toBeVisible({ timeout: 20_000 });

    // Quitter la page article → unmount → sendBeacon de la session de lecture.
    await page.goto('/history', { waitUntil: 'networkidle' });
    await expect
      .poll(
        async () => {
          const { rows: r } = await db!.query<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM "ReadingSession" WHERE "userId" = $1`,
            [userId]
          );
          return r[0].n;
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);

    // 3. La page Historique (GET /v1/me/reading-history, Go) rend la lecture :
    //    on recharge pour reprendre l'état après l'écriture, l'état vide a
    //    disparu et le lien de l'article lu est présent.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`a[href*="/article/${slug}"]`).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Aucune lecture ces 14 derniers jours.')).toHaveCount(0);
  });

  test('la page Réglages charge ses préférences via les endpoints Go', async ({ page }) => {
    await applySessionCookie(page.context());

    // La page /settings appelle getAccountSettingsAction → 4 endpoints Go
    // (/v1/me, /v1/settings/preferences, /v1/notifications/preferences,
    // /v1/me/account-deletion-request). Si l'un échoue, elle redirige vers
    // /login — l'assertion ci-dessous prouve que le bundle Go répond.
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.getByText('Profil public').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Apparence & lecture').first()).toBeVisible({ timeout: 10_000 });
  });
});
