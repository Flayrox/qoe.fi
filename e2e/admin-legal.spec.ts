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
//      « jetons à compléter », publisher (double confirmation), et
//      vérification de la page publique /legal/{slug}.
//
// Le document créé est supprimé en fin de parcours : la base reste propre.
// =====================================================================

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { TestDb } from './lib/db';
import {
  COOKIE_NAME,
  DATABASE_URL,
  GO_API_URL,
  createRealSession,
  upgradeSessionToAal2,
} from './lib/env';
import { expectRedirect } from './lib/redirect';

const ADMIN = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://admin.lvh.me:15405';
// Page publique `/legal/:slug` : elle vit sur la vitrine `apps/hi` (le core
// répond 308 vers `:15401`), pas sur le core. `127.0.0.1`, pas `localhost` :
// sur macOS `localhost` résout d'abord en `::1` et un dev server lié à
// l'IPv4 refuse la connexion.
const PUBLIC_SITE = process.env.PLAYWRIGHT_HI_URL ?? 'http://127.0.0.1:15401';
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
    // La publication d'un document légal est une action sensible : la console
    // exige une authentification **forte récente** (AAL2). Une session AAL1
    // ouvre la modale « Vérification requise » et n'écrit rien — le parcours
    // doit donc élever la session (enrôlement TOTP) avant de publier.
    const aal2 = await upgradeSessionToAal2(session);

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
          access_token: aal2.access_token,
          refresh_token: aal2.refresh_token,
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

    // ── 3. Double validation N3 (quorum) ────────────────────────────────
    // Publier un texte opposable exige l'approbation d'une SECONDE personne
    // autorisée, liée à CETTE version (adminauthz.WithApproval). La console
    // porte la demande, mais le quorum se donne côté API : la fixture crée un
    // second superadmin et joue les deux gestes avant de cliquer « Publier ».
    // Sans lui, le Go refuse la publication (l'UI affichait « Erreur de
    // publication » et la version restait en BROUILLON).
    const versionRows = await db.query<{ id: string }>(
      `SELECT v.id FROM legal_document_version v
       JOIN legal_document d ON d.id = v.document_id
       WHERE d.slug = $1 ORDER BY v.created_at DESC LIMIT 1`,
      [SLUG]
    );
    const versionId = versionRows[0]?.id;
    expect(versionId, 'la version brouillon doit exister en base').toBeTruthy();

    const approverEmail = `legal-approver-${Date.now()}@qoe.fi`;
    const approver = await createRealSession(approverEmail, password);
    await db.ensureUser(approver.gotrueUserId, approverEmail, 'superadmin');
    const approverAal2 = await upgradeSessionToAal2(approver);

    const approvalRes = await fetch(
      `${GO_API_URL}/v1/admin/legal/versions/${versionId}/request-publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aal2.access_token}`,
        },
        body: JSON.stringify({ reason: 'Parcours E2E : double validation N3' }),
      }
    );
    expect(approvalRes.status, `demande de validation = ${approvalRes.status}`).toBeLessThan(300);
    const approval = (await approvalRes.json()) as { id?: string };
    expect(approval.id, 'la demande de validation doit renvoyer un id').toBeTruthy();

    const decideRes = await fetch(`${GO_API_URL}/v1/admin/approvals/${approval.id}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${approverAal2.access_token}`,
      },
      // Le Go attend « approved » / « rejected » (pas « approve ») : toute
      // autre valeur tombe en 400 « Décision invalide ».
      body: JSON.stringify({ decision: 'approved' }),
    });
    expect(
      decideRes.status,
      `validation par le second superadmin = ${decideRes.status}`
    ).toBeLessThan(300);

    // ── 4. Publication (double confirmation acceptée) ───────────────────
    const draftRow = page.locator('li', { hasText: 'Brouillon' }).first();
    await draftRow.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(page.locator('li', { hasText: 'Publiée' }).first()).toBeVisible({
      timeout: 30_000,
    });

    // ── 5. La page publique sert le contenu publié ───────────────────────
    // Le titre apparaît deux fois (en-tête + h1 du markdown) : viser le premier.
    await page.goto(`${PUBLIC_SITE}/legal/${SLUG}`, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: TITLE }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(MARKER)).toBeVisible();

    await browserContext.close();

    // ── 6. Nettoyage : la base de test reste identique ───────────────────
    await db.query(`DELETE FROM legal_document WHERE slug = $1`, [SLUG]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1::uuid[])`, [
      [userId, approver.gotrueUserId],
    ]);
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
