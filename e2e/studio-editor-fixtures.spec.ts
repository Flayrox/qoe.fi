import { test, expect } from '@playwright/test';

// Le banc /dev/editor-check monte le vrai Editor sans session. Ce spec est la
// partie permanente de la revue navigateur : il attrape les régressions de
// badge alt, de compteur, de panneau et de dialogue de raccourcis que les
// tests unitaires ne voient pas.
test.describe("Banc de non-régression de l'éditeur", () => {
  test('badge, compteur, panneau image et raccourcis', async ({ page }) => {
    await page.goto('/dev/editor-check');

    // Fixture : une image seule sans alt + une image de galerie sans alt.
    // Le second <img> est décrit ; le badge n'est posé que sur l'image seule.
    await expect(page.getByRole('button', { name: /2 images sans alt/ })).toBeVisible();
    await expect(page.locator('.qoe-image-alt-badge')).toHaveCount(1);

    // Le contenu de galerie est bien dans la galerie, sans image dupliquée
    // hors du bloc.
    const gallery = page.locator('[data-image-gallery]');
    await expect(gallery).toHaveCount(1);
    await expect(gallery.locator('img[data-gallery-image]')).toHaveCount(1);
    await expect(gallery.locator('img[data-gallery-image]')).toHaveAttribute('src', /svg/);

    await page.locator('.qoe-image-alt-badge').click();
    await expect(page.getByRole('heading', { name: "Détails de l'image" })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Description \(alt\)/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: "Détails de l'image" })).toBeHidden();

    await page.getByRole('button', { name: 'Raccourcis' }).click();
    await expect(page.getByRole('heading', { name: "Raccourcis de l'éditeur" })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: "Raccourcis de l'éditeur" })).toBeHidden();

    // Aperçu lecteur : le fixture monte le vrai corps, et le choix mobile ne
    // doit pas perdre le contenu ni provoquer d'erreur de rendu.
    await page.getByRole('button', { name: 'Aperçu lecteur' }).click();
    await expect(page.getByRole('heading', { name: 'Aperçu lecteur' })).toBeVisible();
    await expect(page.getByText("Banc de non-régression de l'éditeur").last()).toBeVisible();
    await page.getByRole('button', { name: 'Mobile' }).click();
    await expect(page.getByRole('button', { name: 'Mobile' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Aperçu lecteur' })).toBeHidden();

    // Tableaux et sources : deux blocs insérés par la barre d'outils, sans
    // quitter l'éditeur ni perdre le corps existant.
    await page.getByRole('button', { name: 'Insérer un tableau' }).click();
    await expect(page.locator('.ProseMirror table')).toHaveCount(1);

    await page.getByRole('button', { name: 'Insérer des notes et sources' }).click();
    await expect(page.getByRole('heading', { name: 'Notes et sources' })).toBeVisible();
    await page.getByLabel('Libellé de la source 1').fill('Rapport public');
    await page.getByLabel('Adresse de la source 1').fill('https://exemple.fr/rapport');
    await page.getByRole('button', { name: 'Insérer les sources' }).click();
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();

    // Préflight : le fixture n'a que des avertissements (pas de titre vide ni
    // de contenu vide), et le décompte des images sans alt est repris.
    await page.getByRole('button', { name: 'Prêt à publier' }).click();
    await expect(page.getByRole('heading', { name: 'Avant de publier' })).toBeVisible();
    await expect(page.getByText('Prêt, avec')).toBeVisible();
    await expect(page.getByText('2 images sans alt sur 3.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Avant de publier' })).toBeHidden();
  });
});
