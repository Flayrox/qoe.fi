// =====================================================================
// ⚖️ E2E — Console admin : cycle de vie d'un document légal
// =====================================================================
// Deux niveaux :
//   1. AUTH GATE (CI-safe, sans session) : /admin/legal redirige vers
//      /login — le périmètre superadmin est verrouillé.
//   2. PARCOURS COMPLET (local full-stack, RUN_FULL_STACK=1) : une vraie
//      session GoTrue (createRealSession, car getUser server-side exige un
//      compte réel), une ligne User role superadmin, puis le parcours
//      complet dans le CMS légal : création d'un brouillon, avertissement
//      « jetons à compléter », publication (double confirmation), et
//      vérification de la page publique /legal/{slug}.
//
// Le document créé est supprimé en fin de parcours : la base reste propre.
// =====================================================================

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { TestDb } from './lib/db';
import { COOKIE_NAME, DATABASE_URL, createRealSession } from './lib/env';
import { expectRedirect } from './lib/redirect';

const ADMIN = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://admin.lvh.me:15405';
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';

const SLUG = `e2e-legal-${Date.now()}`;
const TITLE = 'Conditions E2E';
const MARKER = 'contact-e2e@qoe.test';
const BODY = [
  '# Conditions E2E',
  '',
  'Ces conditions servent exclusivement au parcours E2E de la console admin.',
  '',
  `Contact : **${MARKER}**.`,
  '',
  'Adresse de contact : **[EMAIL DPO E2E]** — jeton à compléter avant publication.',
].join('\n');

test.describe('Console admin — contenu juridique', () => {
  test('le périmètre superadmin est verrouillé : /admin/legal redirige vers /login', async ({
    request,
  }) => {
    const status = await expectRedirect(request, `${ADMIN}/admin/legal`);
    expect(status, 'doit rediriger (307)').toBe(307);
    const res = await request.get(`${ADMIN}/admin/legal`, { maxRedirects: 0 });
    const location = res.headers()['location'] ?? '';
    expect(location, `Location = ${location}`).toContain('/login');
  });

  test('brouillon → avertissement placeholder → publication → page publique', async ({
    browser,
  }) => {
    test.skip(!RUN_FULL_STACK, 'Parcours complet : nécessite RUN_FULL_STACK=1 + Supabase local');

    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();

    // ── Session GoTrue RÉELLE + ligne User superadmin ────────────────────
    const email = `legal-admin-${Date.now()}@qoe.fi`;
    const password = 'e2e-legal-password-1';
    const session = await createRealSession(email, password);
    const userId = session.gotrueUserId;

    const db = new TestDb(DATABASE_URL);
    await db.connect();
    await db.ensureUser(userId, email, 'superadmin');

    // Idempotence : purge un éventuel document d'un run précédent.
    await db.query(`DELETE FROM legal_document WHERE slug = $1`, [SLUG]);

    const browserContext = await browser.newContext();
    await browserContext.addCookies([
      {
        name: COOKIE_NAME,
        value: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: userId, email, aud: 'authenticated', role: 'authenticated' },
        }),
        domain: '.lvh.me',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    const page = await browserContext.newPage();
    // Le middleware Next canonicalise localhost → admin.lvh.me ; on va
    // directement sur admin.lvh.me pour conserver le cookie de session.
    // Premier hit : compilation Next dev → warm-up explicite.
    await page.goto(`${ADMIN}/admin/legal`, { timeout: 120_000 });

    // La console légale se rend avec la liste des documents.
    await expect(page.getByRole('heading', { name: /CGU, confidentialité/ })).toBeVisible({
      timeout: 60_000,
    });

    // ── 1. Création du brouillon (avec jeton à compléter) ────────────────
    // Les confirm() du CMS (avertissement placeholder + confirmation de
    // publication) sont acceptés automatiquement.
    page.on('dialog', (dialog) => void dialog.accept());

    await page.getByRole('button', { name: 'Nouveau document' }).click();
    const modal = page.locator('div.fixed:has(h2:text-is("Nouveau document juridique"))');
    await expect(modal).toBeVisible();

    await modal.locator('label:has(span:text-is("Slug")) input').fill(SLUG);
    await modal.locator('label:has(span:text-is("Titre")) input').fill(TITLE);
    await modal.locator('label:has(span:text-is("Contenu (markdown)")) textarea').fill(BODY);
    await modal.getByRole('button', { name: 'Créer', exact: true }).click();

    await expect(modal).toBeHidden({ timeout: 30_000 });

    // ── 2. Sélection du document → avertissement placeholder ─────────────
    await page.getByPlaceholder('Rechercher un document…').fill(SLUG);
    await page.locator('button', { hasText: SLUG }).first().click();

    // Le panneau d'avertissement liste le jeton non rempli.
    await expect(page.getByText('Jetons à compléter avant publication')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('code', { hasText: '[EMAIL DPO E2E]' })).toBeVisible();
    // Le badge de la liste latérale signale le document incomplet.
    await expect(page.locator('span', { hasText: 'à compléter' }).first()).toBeVisible();

    // ── 3. Publication (double confirmation acceptée) ────────────────────
    const draftRow = page.locator('li', { hasText: 'Brouillon' }).first();
    await draftRow.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(page.locator('li', { hasText: 'Publiée' }).first()).toBeVisible({
      timeout: 30_000,
    });

    // ── 4. La page publique sert le contenu publié ───────────────────────
    // Le titre apparaît deux fois (en-tête + h1 du markdown) : viser le premier.
    await page.goto(`/legal/${SLUG}`, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: TITLE }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(MARKER)).toBeVisible();

    await browserContext.close();

    // ── 5. Nettoyage : la base de test reste identique ───────────────────
    await db.query(`DELETE FROM legal_document WHERE slug = $1`, [SLUG]);
    await db.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
    await db.close();
    // Le compte GoTrue est retiré au mieux (best-effort, non bloquant).
    try {
      const { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } = await import('./lib/env');
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
    } catch {
      // Non bloquant.
    }
  });
});

// L'import pg ci-dessus n'est utilisé qu'indirectement via TestDb ; on
// conserve la référence pour le linter si le tree-shaking le réclame.
void Client;
