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
// Vérifie que « Voir moins de contenu comme ça » part réellement au
// navigateur (POST /api/feed/show-less → Go) et écrit bien une ligne
// ContentFeedback en base (assertion directe en SQL via pg).
//
// Prérequis : Supabase local (:54321) + qoe-server Go (QOE_API_URL) +
// base seedée — comme public-feed-capture.spec.ts.
// =====================================================================

import { test, expect } from '@playwright/test';
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
  let userId = '';
  let sessionCookieValue = '';
  let db: Client | null = null;

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

    // Session réelle (on purge d'abord tout cookie sb-* existant — y compris
    // le mock d'auth.setup.ts, dont le token serait rejeté par le Go).
    const context = page.context();
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
});
