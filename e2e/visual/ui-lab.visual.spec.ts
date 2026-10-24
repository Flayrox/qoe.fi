import { expect, test, type Page } from '@playwright/test';

// =====================================================================
// 🖼️ Non-régression visuelle des primitives du contrat
// =====================================================================
// 📖 Chaque capture correspond à un spécimen du UI Lab (`/dev/ui-lab`).
//    Le spécimen est un rendu réel des composants, pas une maquette : si
//    une primitive change de hauteur, de rayon ou de couleur, l'image
//    change et le test tombe.
//
// 🎯 Ce que les tests de rôle ne voient pas : un padding qui glisse, une
//    bordure qui disparaît, un anneau de focus qui devient invisible.
// =====================================================================

/**
 * Prépare la page pour une capture reproductible :
 * polices chargées, animations coupées, curseur hors de la page.
 *
 * `animations: 'disabled'` de Playwright ne couvre que les animations CSS
 * finies ; framer-motion anime en JS, d'où la feuille de style imposée.
 */
async function prepare(page: Page) {
  await page.goto('/dev/ui-lab', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        caret-color: transparent !important;
      }
      /* Le déclencheur DevTools est en position fixed : il se poserait
         au-dessus de chaque capture et masquerait le spécimen. */
      .apple-devtools { display: none !important; }
    `,
  });
  // Une capture prise pendant un re-rendu React serait un faux positif :
  // on laisse une frame de marge après l'injection du style.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

/** Le spécimen est rendu et visible — sinon la capture ne prouve rien. */
async function section(page: Page, id: string) {
  // Sélecteur d'attribut : les ids du lab commencent par un chiffre
  // (`08-button`), et `#08-button` n'est pas un sélecteur CSS valide.
  const element = page.locator(`section[id="${id}"]`);
  await expect(element).toBeVisible();
  return element;
}

test.describe('primitives — rendu de référence', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await prepare(page);
  });

  test('boutons : variantes, tons, densités', async ({ page }) => {
    const buttons = page.getByRole('button');
    // Garde-fou : une capture d'une page vide passerait le test visuel en
    // enregistrant simplement une nouvelle référence.
    await expect(buttons.first()).toBeVisible();

    await expect(await section(page, '08-button')).toHaveScreenshot('button.png');
  });

  test('champs : densités, erreur reliée, groupe à icône', async ({ page }) => {
    // L'erreur doit être annoncée, pas seulement peinte : si le câblage
    // ARIA casse, on veut le voir tomber ici plutôt que dans la capture.
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.locator('input[aria-invalid="true"]').first()).toBeVisible();

    await expect(await section(page, '09-fields')).toHaveScreenshot('fields.png');
  });

  test('overlays : menu, sélection, panneau, notification', async ({ page }) => {
    const overlays = await section(page, '10-overlays');
    await expect(overlays.getByRole('button', { name: /actions sur l’article/i })).toBeVisible();

    await expect(overlays).toHaveScreenshot('overlays.png');
  });

  test('dates : segments typés, bornes et calendrier', async ({ page }) => {
    const dates = await section(page, '11-dates');
    // Les segments (jour/mois/année) sont la garantie qu'on ne saisit plus
    // une chaîne : s'ils disparaissent, la capture ne doit pas être mise à
    // jour silencieusement.
    await expect(dates.getByRole('spinbutton').first()).toBeVisible();
    await expect(dates.getByRole('grid').first()).toBeVisible();

    await expect(dates).toHaveScreenshot('dates.png');
  });

  test('composition : avatars, accordéon, bascules, barre d’outils', async ({ page }) => {
    const composition = await section(page, '12-composition');
    // Le groupe de bascules porte `role="group"` : sans lui, trois boutons
    // enfoncés ne disent pas qu'ils répondent à une seule question.
    await expect(composition.getByRole('group').first()).toBeVisible();
    await expect(composition.getByRole('toolbar')).toBeVisible();

    await expect(composition).toHaveScreenshot('composition.png');
  });

  test('overlays — menu ouvert', async ({ page }) => {
    const overlays = await section(page, '10-overlays');

    await overlays.getByRole('button', { name: /actions sur l’article/i }).click();
    await expect(page.getByRole('menu')).toBeVisible();

    // Le popover est porté hors de la section : on capture la fenêtre
    // entière, c'est la seule zone qui contient les deux.
    await expect(page).toHaveScreenshot('overlays-menu-ouvert.png', {
      // Les notifications et le sélecteur de thème sont hors sujet ici.
      mask: [page.locator('header')],
    });
  });

  test('overlays — notification', async ({ page }) => {
    const overlays = await section(page, '10-overlays');

    await overlays.getByRole('button', { name: 'Erreur avec description' }).click();

    const region = page.getByRole('region', { name: 'Notifications' });
    await expect(region).toBeVisible();
    await expect(region).toHaveScreenshot('toast.png');
  });

  test('overlays — panneau latéral ouvert', async ({ page }) => {
    const overlays = await section(page, '10-overlays');

    await overlays.getByRole('button', { name: 'Ouvrir le panneau' }).click();
    await expect(page.getByRole('dialog', { name: 'Réglages de la publication' })).toBeVisible();

    await expect(page).toHaveScreenshot('overlays-drawer.png');
  });

  test('overlays — liste de sélection ouverte', async ({ page }) => {
    const overlays = await section(page, '10-overlays');

    await overlays.getByRole('button', { name: /langue de l’interface/i }).click();
    await expect(page.getByRole('listbox')).toBeVisible();

    await expect(page).toHaveScreenshot('overlays-select-ouvert.png', {
      mask: [page.locator('header')],
    });
  });
});
