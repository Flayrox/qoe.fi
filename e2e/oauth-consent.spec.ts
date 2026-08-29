// =====================================================================
// 🔐 E2E — Vraie page de consentement OAuth (apps/core /oauth/authorize)
// =====================================================================
// Parcours complet d'un tiers qui demande l'accès :
//   1. Visiteur non connecté → redirection /login
//   2. Connexion via la VRAIE page /login (formulaire mot de passe) — les
//      cookies de session sont posés par l'application elle-même
//   3. La page de consentement rend le nom de l'app + scopes demandés
//   4. Clic « Autoriser » → redirection vers l'app tierce avec code + state
//   5. Le code est échangé contre un token via l'API Go (usage unique)
// Prérequis : API Go + base seedée (mêmes webServers que core-journeys).
// =====================================================================

import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import { TestDb } from './lib/db';
import { DATABASE_URL, SUPABASE_ANON_KEY } from './lib/env';

const CONSENT_EMAIL = 'consent.e2e@qoe.fi';
const CONSENT_PASSWORD = 'E2E-Consent-Passw0rd!';
const CLIENT_ID = 'qoe_oauth_e2e_consent';
const CLIENT_SECRET = 'e2e-consent-secret-0123456789';
// lvh.me : le middleware core canonicalise localhost -> lvh.me.
const CORE = 'http://lvh.me:3010';
const REDIRECT_URI = 'http://lvh.me:3010/e2e-oauth-callback';

function sha256hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

test.describe('Consentement OAuth (page réelle)', () => {
  let code_verifier: string;
  let code_challenge: string;

  let supabaseUp = false;

  test.beforeAll(async () => {
    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();

    // Supabase local requis (sessions réelles) : skip propre en CI où
    // seul Postgres existe.
    try {
      const health = await fetch('http://127.0.0.1:54321/auth/v1/health');
      supabaseUp = health.ok;
    } catch {
      supabaseUp = false;
    }
    test.skip(!supabaseUp, 'Supabase local indisponible — parcours consentement local uniquement');

    // L'utilisateur doit exister côté DB avec l'UUID GOTRUE comme id :
    // l'API Go résout /v1/me via le sub du JWT (jamais par email).
    const anon = SUPABASE_ANON_KEY;
    if (!anon) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY requis');

    const signup = await fetch('http://127.0.0.1:54321/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({ email: CONSENT_EMAIL, password: CONSENT_PASSWORD }),
    });
    if (!signup.ok && signup.status !== 422) {
      throw new Error(`GoTrue signup ${signup.status}`);
    }
    const grant = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({
        email: CONSENT_EMAIL,
        password: CONSENT_PASSWORD,
      }),
    });
    const grantBody = (await grant.json()) as { user?: { id?: string } };
    const userId = grantBody.user?.id;
    if (!userId) throw new Error('UUID GoTrue introuvable après connexion');

    const db = new TestDb(DATABASE_URL);
    await db.connect();
    await db.query(`DELETE FROM "User" WHERE email = $1 AND id <> $2`, [CONSENT_EMAIL, userId]);
    await db.ensureUser(userId, CONSENT_EMAIL, 'user');

    // App tierce APPROVED (préalable au consentement).
    await db.query(
      `INSERT INTO "OAuthClient" (id, "ownerUserId", "clientId", "clientSecretHash", name,
                                  description, "redirectUris", status, "createdAt", "updatedAt")
       VALUES ('oauth-e2e-consent-1', $1, $2, $3, 'App E2E Consent',
               'Application de test consentement', ARRAY[$4]::text[], 'APPROVED', now(), now())
       ON CONFLICT ("clientId") DO UPDATE SET status = 'APPROVED',
         "clientSecretHash" = EXCLUDED."clientSecretHash",
         "redirectUris" = EXCLUDED."redirectUris",
         "ownerUserId" = EXCLUDED."ownerUserId"`,
      [userId, CLIENT_ID, sha256hex(CLIENT_SECRET), REDIRECT_URI]
    );
    await db.close();

    code_verifier = 'e2e-pkce-verifier-long-enough-0123456789abcdef';
    code_challenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  });

  function authorizeUrl(): string {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile',
      state: 'e2e-state-42',
      nonce: 'e2e-nonce',
      code_challenge,
      code_challenge_method: 'S256',
    });
    return `/oauth/authorize?${q.toString()}`;
  }

  async function login(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`${CORE}/login`, { waitUntil: 'networkidle' });
    // Bascule du mode lien magique vers mot de passe (attendre l'hydratation).
    const toggle = page.getByRole('button', { name: 'Se connecter par mot de passe' });
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
    const pwd = page.locator('input[name="password"]').first();
    await expect(pwd).toBeVisible({ timeout: 15_000 });
    await page.locator('input[name="email"]').first().fill(CONSENT_EMAIL);
    await pwd.fill(CONSENT_PASSWORD);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).first().click();
    // Attente de la connexion effective (redirection hors /login).
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
      timeout: 30_000,
    });
  }

  test('un visiteur non connecté est renvoyé vers /login', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${CORE}${authorizeUrl()}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await context.close();
  });

  test('consentement complet : rendu, autorisation, code échangeable', async ({ browser }) => {
    test.setTimeout(150_000);
    const context = await browser.newContext();
    const page = await context.newPage();

    // Warm-up compilation dev.
    await page.goto(`${CORE}/home`, { waitUntil: 'domcontentloaded' }).catch(() => {});

    // Connexion réelle via le formulaire de l'application.
    await login(page);

    // Page de consentement : nom de l'app + scopes demandés.
    await page.goto(`${CORE}${authorizeUrl()}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'App E2E Consent' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('souhaite accéder à votre compte')).toBeVisible();
    await expect(page.locator('code', { hasText: 'openid' })).toBeVisible();
    await expect(page.locator('code', { hasText: 'profile' })).toBeVisible();

    // Clic Autoriser → redirection vers l'app tierce avec code + state.
    const autoriser = page.getByRole('button', { name: 'Autoriser' });
    await expect(autoriser).toBeVisible();
    await autoriser.click();
    await page.waitForURL(/e2e-oauth-callback\?.*code=/, { timeout: 30_000 });
    const finalUrl = new URL(page.url());
    expect(finalUrl.searchParams.get('state')).toBe('e2e-state-42');
    const code = finalUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    // Le code est échangeable contre un token (validation serveur).
    const apiBase = process.env.QOE_API_URL ?? 'http://localhost:8090';
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: REDIRECT_URI,
      code_verifier,
    });
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const res = await fetch(`${apiBase}/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: form.toString(),
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`token exchange ${res.status}: ${errBody}`);
    }
    expect(res.status).toBe(200);
    const tok = (await res.json()) as { access_token?: string };
    expect(tok.access_token).toBeTruthy();

    // Usage unique : rejouer l'échange échoue.
    const replay = await fetch(`${apiBase}/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: form.toString(),
    });
    expect(replay.status).not.toBe(200);

    await context.close();
  });
});
