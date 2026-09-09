// =====================================================================
// 🚦 E2E — Contrôle d'accès global de l'API (kill switch + endpoints)
// =====================================================================
// Vérifie contre l'API Go RÉELLE (QOE_API_URL, démarée par la config
// Playwright) que les bascules de la console admin sont enforceables côté
// serveur :
//   • API_ACCESS_DISABLED=true      → /v1/* répond 503 (sauf admin/OAuth)
//   • API_DISABLED_ENDPOINTS=[...]  → les préfixes listés répondent 404
// La config est lue avec un cache court (~5 s) : chaque test bascule la
// clé en base, attend l'application via expect.poll, puis nettoie.
// CI-safe (aucune session requise). À noter : les tests d'autres projets
// qui touchent l'API Go peuvent être sensibles à la fenêtre de coupure —
// lancer localement avec `pnpm e2e --project=security` si besoin.
// =====================================================================

import { test, expect, request as pwRequest } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL, GO_API_URL } from './lib/env';

const KILL_SWITCH_KEY = 'API_ACCESS_DISABLED';
const ENDPOINTS_KEY = 'API_DISABLED_ENDPOINTS';

// Le middleware cache la config ~5 s : on laisse la marge via expect.poll.
const APPLY_TIMEOUT_MS = 20_000;

test.describe('Contrôle d’accès global (API Go)', () => {
  let db: TestDb;

  test.beforeAll(async () => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base seedée)').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();
  });

  test.afterEach(async () => {
    // Toujours ré-ouvrir l'API, même en cas d'échec d'un test.
    await db.query(`DELETE FROM "SystemConfig" WHERE key IN ($1, $2)`, [
      KILL_SWITCH_KEY,
      ENDPOINTS_KEY,
    ]);
  });

  test.afterAll(async () => {
    await db.close();
  });

  test('la coupure générale fait répondre 503 sur /v1/* mais pas admin/OAuth', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });

    // État nominal : l'API répond.
    const before = await api.get('/v1/home/config');
    expect(before.status()).toBe(200);

    // ⛔ Coupure générale.
    await db.query(
      `INSERT INTO "SystemConfig" (key, value, description, "updatedAt")
       VALUES ($1, 'true', 'e2e', now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [KILL_SWITCH_KEY]
    );

    await expect
      .poll(async () => (await api.get('/v1/home/config')).status(), {
        timeout: APPLY_TIMEOUT_MS,
      })
      .toBe(503);

    // Les chemins vitaux restent joignables : console admin (401 sans session,
    // pas 503) et IdP OAuth (userinfo → 401, pas 503).
    const admin = await api.get('/v1/admin/dashboard');
    expect(admin.status()).toBe(401);
    const oauth = await api.get('/v1/oauth/userinfo');
    expect(oauth.status()).toBe(401);

    // ✅ Réouverture : la bascule est levée après le TTL.
    await db.query(`DELETE FROM "SystemConfig" WHERE key = $1`, [KILL_SWITCH_KEY]);
    await expect
      .poll(async () => (await api.get('/v1/home/config')).status(), {
        timeout: APPLY_TIMEOUT_MS,
      })
      .toBe(200);

    await api.dispose();
  });

  test('les endpoints désactivés répondent 404, le reste continue de marcher', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });

    // Liste de préfixes désactivés (JSON array, comme la console admin).
    await db.query(
      `INSERT INTO "SystemConfig" (key, value, description, "updatedAt")
       VALUES ($1, '["/v1/home/config"]', 'e2e', now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [ENDPOINTS_KEY]
    );

    await expect
      .poll(async () => (await api.get('/v1/home/config')).status(), {
        timeout: APPLY_TIMEOUT_MS,
      })
      .toBe(404);

    // Un endpoint non listé continue de fonctionner (pas de coupure générale).
    const other = await api.get('/v1/feed/trending');
    expect(other.status()).toBe(200);

    // Les endpoints admin restent protégés par le superadmin, pas par la liste.
    const admin = await api.get('/v1/admin/dashboard');
    expect(admin.status()).toBe(401);

    // ✅ Nettoyage → l'endpoint répond de nouveau.
    await db.query(`DELETE FROM "SystemConfig" WHERE key = $1`, [ENDPOINTS_KEY]);
    await expect
      .poll(async () => (await api.get('/v1/home/config')).status(), {
        timeout: APPLY_TIMEOUT_MS,
      })
      .toBe(200);

    await api.dispose();
  });
});
