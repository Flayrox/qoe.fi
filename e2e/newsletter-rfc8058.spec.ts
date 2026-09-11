// =====================================================================
// 📧 E2E — Désabonnement One-Click RFC 8058 & Sécurité Cryptographique
// =====================================================================
// Valide le respect strict de la RFC 8058 (exigée par Gmail & Yahoo 2024+)
// ainsi que l'étanchéité anti-IDOR via signature HMAC-SHA256 timing-safe.
// =====================================================================

import { test, expect, request as pwRequest } from '@playwright/test';
import crypto from 'crypto';
import { TestDb } from './lib/db';
import { DATABASE_URL, GO_API_URL } from './lib/env';

test.describe('RFC 8058 Newsletter Unsubscribe & HMAC Security', () => {
  let db: TestDb;
  const pubID = 'pub_12345678123412341234123456789012';
  const email = 'subscriber-rfc8058@qoe.test';
  const secret = process.env.NEWSLETTER_UNSUB_SECRET || 'qoe-unsub-default-secret-min32chars';

  function sign(pub: string, targetEmail: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${pub}:${targetEmail.toLowerCase().trim()}`);
    return hmac.digest('hex');
  }

  test.beforeAll(async () => {
    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();

    // Insérer un abonné actif pour tester la désinscription réelle
    await db.query(
      `INSERT INTO "Subscriber" ("id", "publicationId", "email", "receiveArticles", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())
       ON CONFLICT ("publicationId", "email") DO UPDATE SET "receiveArticles" = true`,
      [`sub_${Date.now()}`, pubID, email]
    );
  });

  test.afterAll(async () => {
    await db?.close();
  });

  test('rejette une requête sans signature cryptographique (403 Forbidden)', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });
    const res = await api.get(
      `/v1/newsletters/unsubscribe?pub=${pubID}&email=${encodeURIComponent(email)}`
    );
    expect(res.status()).toBe(403);
    const body = await res.json().catch(() => ({}));
    expect(body.error).toContain('Signature');
    await api.dispose();
  });

  test('rejette une signature falsifiée ou altérée (403 Forbidden)', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });
    const res = await api.get(
      `/v1/newsletters/unsubscribe?pub=${pubID}&email=${encodeURIComponent(email)}&sig=fake_sig_123456789`
    );
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  test('rejette une signature valide pour un email différent (anti-usurpation IDOR)', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });
    const foreignSig = sign(pubID, 'other@victim.com');
    const res = await api.get(
      `/v1/newsletters/unsubscribe?pub=${pubID}&email=${encodeURIComponent(email)}&sig=${foreignSig}`
    );
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  test('accepte le lien web GET avec signature valide et rend la page de succès', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });
    const validSig = sign(pubID, email);
    const res = await api.get(
      `/v1/newsletters/unsubscribe?pub=${pubID}&email=${encodeURIComponent(email)}&sig=${validSig}`
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('désabonné');
    await api.dispose();
  });

  test('accepte le POST RFC 8058 One-Click Mail-Client et désactive receiveArticles en base', async () => {
    // Réactiver l'abonné d'abord
    await db.query(
      `UPDATE "Subscriber" SET "receiveArticles" = true WHERE "publicationId" = $1 AND "email" = $2`,
      [pubID, email]
    );

    const api = await pwRequest.newContext({ baseURL: GO_API_URL });
    const validSig = sign(pubID, email);

    const res = await api.post(
      `/v1/newsletters/unsubscribe?pub=${pubID}&email=${encodeURIComponent(email)}&sig=${validSig}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: 'List-Unsubscribe=One-Click',
      }
    );

    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('Unsubscribed successfully');

    // Vérification en base de données : receiveArticles doit être à false
    const rows = await db.query<{ receiveArticles: boolean }>(
      `SELECT "receiveArticles" FROM "Subscriber" WHERE "publicationId" = $1 AND "email" = $2`,
      [pubID, email]
    );
    expect(rows[0]?.receiveArticles).toBe(false);

    await api.dispose();
  });
});
