// =====================================================================
// 🔒 E2E — confidentialité de l'identité d'un liker
// =====================================================================
// Parcours réel : GoTrue → cookie SSR → Core Settings → page pensée → API Go
// → PostgreSQL. Le test vérifie la règle importante : rendre ses likes privés
// retire l'identité des listes publiques sans retirer le like ni le compteur.
// =====================================================================

import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  COOKIE_NAME,
  DATABASE_URL,
  GO_API_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  createRealSession,
} from './lib/env';
const email = `e2e.like-privacy.${Date.now()}@qoe.fi`;
const password = 'e2e-like-privacy-123!';

const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY;

test.describe('Confidentialité des likes (Core)', () => {
  test.describe.configure({ mode: 'serial' });

  let db: Client | null = null;
  let userId = '';
  let accessToken = '';
  let refreshToken = '';
  let targetPostId = '';
  let targetAuthorId = '';
  let targetPublicationId = '';
  let targetAuthorUsername = '';
  let privateUsername = '';
  let initialLikeCount = 0;
  let sessionCookieValue = '';

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

  async function apiFetch<T>(pathName: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${GO_API_URL}${pathName}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });
    const body = (await response.json().catch(() => ({}))) as T | { data?: T; error?: string };
    if (!response.ok) {
      const error = 'error' in body ? body.error : undefined;
      throw new Error(`Go API ${response.status}: ${error ?? 'request failed'}`);
    }
    return 'data' in body && body.data !== undefined ? body.data : (body as T);
  }

  test.beforeAll(async () => {
    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();
    expect(SUPABASE_URL, 'SUPABASE_URL requis').toBeTruthy();
    expect(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY requis').toBeTruthy();

    const session = await createRealSession(email, password);
    userId = session.gotrueUserId;
    accessToken = session.access_token;
    refreshToken = session.refresh_token;
    sessionCookieValue = JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email, aud: 'authenticated', role: 'authenticated' },
    });

    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();

    privateUsername = `e2e-like-${Date.now()}`;
    await db.query(
      `INSERT INTO "User" (id, email, username, name, role, "hasCompletedOnboarding", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'user', true, now(), now())`,
      [userId, email, privateUsername, 'Lecteur Likes Privés']
    );

    // La base de test peut être seedée sans pensées : la fixture possède donc
    // son auteur, sa publication et son post cible pour rester indépendante du
    // contenu de démonstration (et ne pas modifier la base de développement).
    targetAuthorId = randomUUID();
    targetPublicationId = `e2e-like-publication-${Date.now()}`;
    targetAuthorUsername = `e2e-target-${Date.now()}`;
    targetPostId = `e2e-like-post-${Date.now()}`;
    await db.query(
      `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
       VALUES ($1, 'PERSONAL', $2, $3, now(), now())`,
      [targetPublicationId, 'Auteur cible E2E', targetAuthorUsername]
    );
    await db.query(
      `INSERT INTO "User" (id, email, username, name, role, "publicationId", "hasCompletedOnboarding", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'creator', $5, true, now(), now())`,
      [
        targetAuthorId,
        `e2e.target.${Date.now()}@qoe.fi`,
        targetAuthorUsername,
        'Auteur cible E2E',
        targetPublicationId,
      ]
    );
    await db.query(
      `INSERT INTO "Post" (id, content, "authorId", tags, visibility, "contentVisibility", "isDraft", "replyRestriction", "likeCount", "repostCount", "replyCount", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, ARRAY['e2e']::text[], 'public', 'PUBLIC', false, 'everyone', 0, 0, 0, now(), now())`,
      [targetPostId, 'Pensée publique pour le test de confidentialité des likes', targetAuthorId]
    );
    initialLikeCount = 0;
  });

  test.afterAll(async () => {
    if (db) {
      if (targetPostId) await db.query(`DELETE FROM "Post" WHERE id = $1`, [targetPostId]);
      if (userId || targetAuthorId) {
        await db.query(`DELETE FROM "User" WHERE id = ANY($1::uuid[])`, [
          [userId, targetAuthorId].filter(Boolean),
        ]);
      }
      if (targetPublicationId) {
        await db.query(`DELETE FROM "Publication" WHERE id = $1`, [targetPublicationId]);
      }
      await db.end();
    }
    if (userId && serviceRoleKey) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }).catch(() => undefined);
    }
  });

  test('rend un like privé dans Settings puis masque son identité partout en public', async ({
    page,
  }) => {
    await applySessionCookie(page.context());

    // 1. Le réglage est modifié depuis l'interface Core, avec une URL dédiée.
    await page.goto('/settings/privacy', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/settings\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Confidentialité' })).toBeVisible({
      timeout: 30_000,
    });

    const likeVisibility = page.getByLabel('Visibilité de mes likes');
    await expect(likeVisibility).toHaveValue('PUBLIC');
    await likeVisibility.selectOption('PRIVATE');
    await expect(likeVisibility).toHaveValue('PRIVATE');
    await expect(page.getByText('Réglage enregistré.')).toBeVisible({ timeout: 15_000 });

    // 2. Le like est créé par le vrai bouton de la vraie page pensée.
    await page.goto(`/${targetAuthorUsername}/thought/${targetPostId}`, {
      waitUntil: 'networkidle',
    });
    const likeButton = page.locator('button[aria-label="J\'aime"]').first();
    await expect(likeButton).toBeVisible({ timeout: 30_000 });
    await likeButton.click();

    // 3. Le backend Go confirme l'état viewer et conserve le compteur global.
    await expect
      .poll(
        async () => {
          const post = await apiFetch<{
            liked: boolean;
            likeCount: number;
          }>(`/v1/posts/${targetPostId}`);
          return { liked: post.liked, likeCount: post.likeCount };
        },
        { timeout: 20_000 }
      )
      .toEqual({ liked: true, likeCount: initialLikeCount + 1 });

    // 4. Sans authentification, la liste publique ne renvoie jamais le liker privé.
    const publicLikes = await fetch(
      `${GO_API_URL}/v1/posts/${encodeURIComponent(targetPostId)}/likes?limit=100`
    );
    expect(publicLikes.status).toBe(200);
    const likesEnvelope = (await publicLikes.json()) as {
      data?: { items?: Array<{ id: string; username: string | null }> };
    };
    const publicItems = likesEnvelope.data?.items ?? [];
    expect(publicItems).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: userId })])
    );
    expect(publicItems.every((actor) => actor.username !== privateUsername)).toBe(true);

    // 5. Le profil public de l'auteur ne fait pas apparaître l'identité privée.
    // La sidebar affiche volontairement le compte connecté ; on limite donc
    // l'assertion au flux/profile stream, jamais au document entier.
    await page.goto(`/${targetAuthorUsername}`, { waitUntil: 'networkidle' });
    const publicProfile = page.locator('main').last();
    await expect(publicProfile).toContainText(
      'Pensée publique pour le test de confidentialité des likes'
    );
    await expect(publicProfile).not.toContainText('Lecteur Likes Privés');
    await expect(publicProfile).not.toContainText(privateUsername);
  });
});
