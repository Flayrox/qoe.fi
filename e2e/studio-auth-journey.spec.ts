// =====================================================================
// 🔐 E2E — Studio authentifié : login réel, éditeur, publication
// =====================================================================
// Pourquoi ce fichier existe : les preuves L20k couvraient les surfaces
// **déconnectées** (toute la surface studio redirige vers le login). Ici on
// prouve l'inverse, sur les pages réellement authentifiées :
//
//   1. un compte est créé par un **vrai chemin GoTrue** (`createRealSession` :
//      signup + confirmation admin + password grant) — aucun mock d'auth ;
//   2. la session est obtenue par un **login réel dans le formulaire** du core
//      (mode mot de passe de `LoginFormBento`), pas par injection de cookie ;
//   3. l'éditeur s'ouvre, on édite un article puis on le publie (server action
//      → API Go) ;
//   4. la garde réseau L20k observe **tout** ce parcours : login, éditeur,
//      publication — 0 requête vers l'infra partagée `116.203.158.47`, et le
//      seul Supabase appelé est la boucle locale.
//
// Gate `RUN_FULL_STACK=1` : même convention que « un créateur authentifié
// accède à son dashboard » — le job CI `e2e-apps` n'a ni GoTrue ni core, donc
// ce parcours est réservé au banc full-stack local/CI dédié.
// =====================================================================

import { test, expect } from '@playwright/test';

import { TestDb } from './lib/db';
import { COOKIE_NAME, DATABASE_URL, createRealSession } from './lib/env';
import { assertSupabaseTraffic, watchOutgoing } from './lib/supabase-network-guard';

// Hôtes canoniques de la stack : le middleware studio réécrit
// `localhost:15404` → `studio.lvh.me:15404`, et le cookie de session est posé
// sur `.lvh.me` — core et studio se partagent donc la session.
const STUDIO = process.env.PLAYWRIGHT_FULL_STACK_STUDIO_URL ?? 'http://studio.lvh.me:15404';
const CORE = process.env.PLAYWRIGHT_CORE_URL ?? 'http://lvh.me:15402';
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';

test.describe('Studio authentifié — parcours réel', () => {
  test('login réel → éditeur → édition → publication, sans joindre le Supabase partagé', async ({
    context,
    page,
  }) => {
    test.skip(
      !RUN_FULL_STACK,
      'Parcours complet : nécessite RUN_FULL_STACK=1 + core + Supabase local'
    );
    expect(DATABASE_URL, 'DATABASE_URL requis pour la fixture créateur').toBeTruthy();

    const stamp = Date.now();
    const email = `studio-auth-${stamp}@qoe.fi`;
    const password = `E2e-password-${stamp}`;
    const title = `Article e2e authentifié ${stamp}`;
    const publisherId = 'pub_studio_auth_e2e';

    // 1. Compte réel : GoTrue local (signup + confirmation + password grant).
    const session = await createRealSession(email, password);

    // 2. Fixture déterministe : la publication et la ligne User portent l'UUID
    //    GoTrue, sinon l'API Go refuse l'action de sauvegarde.
    const db = new TestDb(DATABASE_URL);
    await db.connect();
    // ⚠️ Ordre imposé par le schéma : `User_publisherId_key` (un user par
    // publication) et le trigger `trg_cleanup_user_personal_publisher`
    // (migration 00081) qui **supprime la publication PERSONAL** quand son
    // user disparaît. On évince donc les restes d'un run précédent AVANT de
    // recréer la publication, sinon l'insertion du user viole
    // `User_publicationId_fkey`.
    await db.query(`DELETE FROM "User" WHERE email = $1 OR "publisherId" = $2`, [
      email,
      publisherId,
    ]);
    await db.ensurePublisher({
      id: publisherId,
      subdomain: 'studio-auth-e2e',
      name: 'Studio Authentifié E2E',
      type: 'PERSONAL',
      authorId: session.gotrueUserId,
      authorEmail: email,
      authorUsername: `studioauth${String(stamp).slice(-6)}`,
    });
    await db.ensureUser(session.gotrueUserId, email, 'creator', {
      publisherId,
      hasCompletedOnboarding: true,
    });

    try {
      // 3. Observation AVANT toute navigation : login, éditeur et publication
      //    sont couverts par la même capture.
      const watch = watchOutgoing(page);

      await page.goto(`${CORE}/login?next=${encodeURIComponent(`${STUDIO}/`)}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByRole('button', { name: 'Se connecter par mot de passe' }).click();
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      // `exact: true` : le basculeur « Se connecter par lien magique » contient
      // aussi « Se connecter » (violation du mode strict sinon).
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

      // Le login mot de passe de supabase-js doit produire une session réelle.
      await page.waitForURL(new RegExp(`^${STUDIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), {
        timeout: 45_000,
      });
      const cookies = await context.cookies();
      expect(
        cookies.some((cookie) => cookie.name === COOKIE_NAME && cookie.value.length > 20),
        `session ${COOKIE_NAME} attendue après login (cookies : ${cookies
          .map((cookie) => cookie.name)
          .join(', ')})`
      ).toBe(true);

      // 4. Surface authentifiée : le studio se rend pour ce créateur.
      const sidebar = page.locator('aside, nav').first();
      await expect(sidebar).toBeVisible({ timeout: 30_000 });

      // 5. Éditeur réel : nouveau brouillon, titre + corps.
      await page.goto(`${STUDIO}/articles/new`, { waitUntil: 'domcontentloaded' });

      // 5a. Un créateur tout neuf doit accepter les documents légaux publiés :
      // la modale bloque l'éditeur tant que ce n'est pas fait (garde
      // `guard:legal-consent`). C'est une étape réelle du parcours, pas un
      // contournement.
      const consent = page.getByRole('dialog').filter({ hasText: 'Mise à jour des conditions' });
      await expect(consent).toBeVisible({ timeout: 20_000 });
      const boxes = consent.getByRole('checkbox');
      const boxCount = await boxes.count();
      expect(boxCount, 'documents légaux à accepter').toBeGreaterThan(0);
      for (let index = 0; index < boxCount; index += 1) {
        await boxes.nth(index).click();
      }
      // Apostrophe typographique (U+2019) dans `LegalConsentGate`.
      await consent.getByRole('button', { name: 'J’accepte et je continue' }).click();
      await expect(consent).toBeHidden({ timeout: 20_000 });

      const titleInput = page.getByPlaceholder('Titre de votre article...');
      await expect(titleInput).toBeVisible({ timeout: 30_000 });
      await titleInput.fill(title);
      const body = page.locator('.ProseMirror').first();
      await expect(body).toBeVisible();
      await body.click();
      await page.keyboard.type('Corps écrit par le parcours e2e authentifié.');

      // 6. Publication : modale de diffusion → « Web uniquement » (pas de
      //    newsletter en e2e) → publication effective.
      await page.getByRole('button', { name: 'Publier', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Prêt pour la publication' });
      await expect(modal).toBeVisible({ timeout: 15_000 });
      await modal.getByText('Web uniquement').click();
      await modal.getByRole('button', { name: 'Publier sur le web' }).click();
      // Toute la modale doit disparaître : s'arrêter au libellé « Prêt pour la
      // publication » laissait passer le cas où elle se rouvre en
      // « Diffusion & Distribution » pendant l'envoi.
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 });

      // 7. La publication est réelle : le serveur action répond après l'appel
      //    à l'API Go, donc on attend que la ligne soit effectivement publiée
      //    au lieu de parier sur l'ordre des deux opérations.
      const readArticle = () =>
        db.query<{ published: boolean; authorId: string }>(
          `SELECT published, "authorId" FROM "Article" WHERE title = $1 ORDER BY "createdAt" DESC LIMIT 1`,
          [title]
        );
      await expect
        .poll(async () => (await readArticle())[0]?.published === true, {
          message: `article « ${title} » publié en base`,
          timeout: 20_000,
        })
        .toBe(true);
      const rows = await readArticle();
      expect(rows[0].authorId).toBe(session.gotrueUserId);

      // 8. Capture réseau du parcours complet : le login a bien appelé un
      //    Supabase (la boucle locale), et rien n'est parti vers l'infra
      //    partagée, même quand le `.env` du poste pointe le VPS.
      expect(
        watch.supabaseUrls().some((url) => url.includes('/auth/v1/token')),
        `login Supabase attendu dans la capture (URLs : ${watch.supabaseUrls().join(', ')})`
      ).toBe(true);
      assertSupabaseTraffic('studio authentifié', watch);
    } finally {
      await db.query(`DELETE FROM "Article" WHERE title = $1`, [title]).catch(() => {});
      await db.close();
    }
  });
});
