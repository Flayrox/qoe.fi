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

    // 🛡️ Les avatars du spécimen sont ceux du produit, pas une primitive
    // parallèle : `SafeAvatar` est le seul rendu, et sa règle de forme est
    // lisible sans inspecter les classes.
    const avatars = composition.locator('[data-avatar]');
    await expect(avatars.first()).toBeVisible();
    await expect(composition.locator('[data-slot="avatar"]')).toHaveCount(0);

    const media = composition.locator('[data-avatar][data-account-type="MEDIA"]');
    const people = composition.locator('[data-avatar][data-account-type="PERSONAL"]');
    await expect(media.first()).toHaveAttribute('data-avatar-shape', 'square');
    await expect(people.first()).toHaveAttribute('data-avatar-shape', 'circle');

    // Un média reste un carré à PETITS coins, à toutes les tailles ; une
    // personne est un cercle. Le rayon effectif est lu dans le navigateur,
    // pas dans une classe supposée.
    const mediaRadii = await media.evaluateAll((nodes) => [
      ...new Set(nodes.map((node) => getComputedStyle(node).borderRadius)),
    ]);
    expect(mediaRadii.every((radius) => parseFloat(radius) > 0 && parseFloat(radius) < 10)).toBe(
      true
    );
    const personRadii = await people.evaluateAll((nodes) => [
      ...new Set(nodes.map((node) => getComputedStyle(node).borderRadius)),
    ]);
    expect(personRadii.every((radius) => parseFloat(radius) > 1000)).toBe(true);

    // Le repli est rendu pour l’URL morte (Awa) : la silhouette porte
    // `role=img`, une image cassée n’est plus dans le DOM. On amène la
    // rangée dans la fenêtre, sinon l’image `loading=lazy` ne demande
    // jamais son URL et ne peut pas échouer.
    await composition.scrollIntoViewIfNeeded();
    const fallback = composition.locator('[data-avatar][aria-label="Awa Traoré"]');
    await expect(fallback).toHaveAttribute('role', 'img');
    await expect(fallback.locator('img')).toHaveCount(0);

    // La barre supérieure du spécimen est une composition réelle : deux
    // identités, deux natures.
    const topBar = composition.locator('[data-specimen-top-bar]');
    await expect(topBar.locator('[data-avatar]')).toHaveCount(2);
    await expect(topBar.locator('[data-avatar][data-account-type="MEDIA"]')).toHaveAttribute(
      'data-avatar-shape',
      'square'
    );

    await expect(composition).toHaveScreenshot('composition.png');

    // 🪪 Le survol d’une identité ouvre sa fiche — et pas celle d’un autre.
    await topBar.locator('[data-slot="hover-card-trigger"]').last().hover();
    const card = page.locator('[data-slot="hover-card-content"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Camille');
    await expect(card).toContainText('Média');
    await expect(card).toContainText('@camille');
    await expect(card.locator('[data-avatar][data-account-type="MEDIA"]')).toHaveAttribute(
      'data-avatar-shape',
      'square'
    );
  });

  test('saisies longues : recherche, table, couleur', async ({ page }) => {
    const inputs = await section(page, '13-inputs-complexes');
    // La table est une grille react-aria : si le rôle disparaît, la capture
    // ne montrera pas la régression de navigation au clavier.
    await expect(inputs.getByRole('grid').first()).toBeVisible();
    await expect(inputs.getByRole('combobox').first()).toBeVisible();

    await expect(inputs).toHaveScreenshot('inputs-complexes.png');
  });

  test('sélection : cases, colonne de sélection, tables denses', async ({ page }) => {
    const selection = await section(page, '14-selection-tables');
    // Trois choses doivent être vraies pour que la capture ait un sens :
    // la case indéterminée est bien « mixed » pour le lecteur d'écran, la
    // colonne de sélection est une case, et la table compacte reste une
    // grille.
    //
    // ⚠️ Sur un `input[type=checkbox]` natif, react-aria ne pose pas
    // `aria-checked` : il met la propriété DOM `indeterminate`, que la
    // couche d'accessibilité traduit en « mixed ». C'est elle qu'on lit —
    // `toBeChecked({ checked: 'mixed' })` ne regarde qu'`aria-checked` et
    // conclurait « unchecked » sur une case pourtant annoncée partielle.
    await expect
      .poll(() =>
        selection
          .getByRole('checkbox', { name: /indéterminé/i })
          .evaluate((element) => (element as HTMLInputElement).indeterminate)
      )
      .toBe(true);
    await expect(selection.getByRole('grid').first()).toBeVisible();

    await expect(selection).toHaveScreenshot('selection-tables.png');
  });

  test('pièces rapportées : annotation, biseau, maintien', async ({ page }) => {
    const ported = await section(page, '15-ported-pieces');
    // Le bouton de maintien doit être là : c'est la seule pièce dont le
    // rendu dépend d'un état (repos), et un `data-state` perdu le
    // figerait en « done » sans que la capture le dise.
    await expect(ported.locator('button[data-state="idle"]')).toBeVisible();

    await expect(ported).toHaveScreenshot('ported-pieces.png');
  });

  test('surlignage : la peau des marks', async ({ page }) => {
    const marks = await section(page, '16-mark-skin');
    await expect(marks.locator('mark.qoe-mark-official').first()).toBeVisible();

    // Le trait est une image de fond, pas une bordure : si le CSS du thème
    // n'est pas chargé, la teinte reste et le trait disparaît sans que la
    // capture s'en aperçoive — on vérifie donc qu'il y a bien un tracé.
    const backgroundImage = await marks
      .locator('mark')
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(backgroundImage).toContain('data:image/svg+xml');

    // 🎯 Les quatre états, mesurés dans le navigateur. Une capture seule ne
    // dit pas si deux peaux ont fusionné : on lit les valeurs RÉSOLUES.
    const states = await marks
      .locator('p:has(mark)')
      .first()
      .evaluate((paragraph) => {
        const fontProps = [
          'fontFamily',
          'fontSize',
          'fontWeight',
          'fontStyle',
          'fontVariantLigatures',
          'fontFeatureSettings',
          'fontKerning',
          'lineHeight',
          'letterSpacing',
        ] as const;
        const paragraphStyle = getComputedStyle(paragraph);
        return [...paragraph.querySelectorAll('mark')].map((mark) => {
          const style = getComputedStyle(mark);
          return {
            kind: [...mark.classList].find((name) => name.startsWith('qoe-mark-')),
            background: style.backgroundColor,
            stroke: style.backgroundImage,
            sameFontAsParagraph: fontProps.every(
              (property) => style[property] === paragraphStyle[property]
            ),
          };
        });
      });

    expect(states.map((state) => state.kind)).toEqual([
      'qoe-mark-official',
      'qoe-mark-public',
      'qoe-mark-highlight',
      'qoe-mark-private',
    ]);
    // Quatre fonds distincts, dont le surlignage nu transparent : si la
    // privée reprend l'ambre de l'officielle, ce test tombe.
    expect(new Set(states.map((state) => state.background)).size).toBe(4);
    // Quatre tracés distincts : double, plein fin, pointillé fin, pointillé.
    expect(new Set(states.map((state) => state.stroke)).size).toBe(4);
    // La marque ne change ni police, ni graisse, ni style, ni interligne.
    expect(states.every((state) => state.sameFontAsParagraph)).toBe(true);

    await expect(marks).toHaveScreenshot('mark-skin.png');
  });

  test('citation : une annotation partagée se publie, un surlignage nu ne le peut pas', async ({
    page,
  }) => {
    const flow = await section(page, '17-annotation-flow');
    const dialog = page.locator('[role="dialog"]');

    // 1) Une annotation publique avec note : la citation est offerte et
    //    l'aperçu reprend la note + son auteur, pas un commentaire libre.
    await flow.locator('mark[data-highlight-id="lab-public-1"]').click();
    await expect(dialog.locator('#annotation-drawer-title')).toHaveText('Annotation');
    await dialog.getByRole('button', { name: 'Citer cette annotation' }).click();

    const form = dialog.locator('[data-annotation-citation-form]');
    await expect(form).toBeVisible();
    await expect(form).toContainText('Annotation de Camille');
    await expect(form).toContainText('Ici, la formule revient comme une conclusion');
    await expect(form).toContainText('L’article et le passage annoté accompagnent la note');

    await form.getByRole('button', { name: 'Publier la citation' }).click();
    await expect(dialog.locator('[role="status"]')).toContainText('Citation publiée sur Qoefi');

    // 2) Le résultat est la carte du feed : attribution, note, passage et
    //    article, sous le même bloc — pas un post ordinaire.
    await page.keyboard.press('Escape');
    const published = page.locator('[data-quoted-annotation="lab-public-1"]');
    await expect(published).toBeVisible();
    await expect(published).toContainText('Annotation de Camille');
    await expect(published).toContainText('Ici, la formule revient comme une conclusion');
    await expect(published).toContainText('ce qu’il relirait deux fois');
    await expect(published).toContainText('La lenteur comme méthode');

    // 3) Un surlignage nu reste un surlignage : aucune publication possible,
    //    et le tiroir dit pourquoi.
    await flow.locator('mark[data-highlight-id="lab-highlight-1"]').click();
    await expect(dialog.locator('#annotation-drawer-title')).toHaveText('Surlignage');
    await expect(dialog.getByRole('button', { name: 'Citer cette annotation' })).toHaveCount(0);
    await expect(dialog.locator('[data-annotation-citation-hint]')).toContainText(
      'Un surlignage n’a pas de texte à citer'
    );

    // 4) Une annotation privée non plus — le tiroir explique la condition.
    await page.keyboard.press('Escape');
    await flow.locator('mark[data-highlight-id="lab-private-1"]').click();
    await expect(dialog.locator('#annotation-drawer-title')).toHaveText('Annotation');
    await expect(dialog.getByRole('button', { name: 'Citer cette annotation' })).toHaveCount(0);
    await expect(dialog.locator('[data-annotation-citation-hint]')).toContainText(
      'Cette annotation est privée'
    );
  });

  test('tiroir d’annotation : l’ossature ne bouge pas d’une nature à l’autre', async ({ page }) => {
    const flow = await section(page, '17-annotation-flow');
    const dialog = page.locator('[role="dialog"]');
    const kinds = [
      ['lab-official-1', 'var(--annotation-official)'],
      ['lab-public-1', 'var(--annotation-public)'],
      ['lab-private-1', 'var(--annotation-private)'],
      ['lab-highlight-1', 'var(--annotation-highlight)'],
    ] as const;

    type Box = { x: number; y: number; w: number; h: number };

    const rows: {
      accent: string;
      panelRadius: string;
      prev: Box;
      next: Box;
      close: Box;
      title: Box;
      note: Box;
      quote: Box;
    }[] = [];

    for (const [id] of kinds) {
      await flow.locator(`mark[data-highlight-id="${id}"]`).click();
      await expect(dialog.locator('#annotation-drawer-title')).toBeVisible();
      // Attendre la fin du ressort : une mesure pendant l'entrée donne des
      // écarts sous-pixel qui ne disent rien de la mise en page.
      await page.waitForFunction(() => {
        const panel = document.querySelector('[role="dialog"]');
        return panel ? getComputedStyle(panel).transform === 'none' : false;
      });

      rows.push(
        await dialog.evaluate((panel) => {
          const q = (selector: string) => panel.querySelector(selector)!;
          const box = (element: Element) => {
            const b = element.getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
          };
          return {
            accent: panel.style.getPropertyValue('--qoe-annotation-accent'),
            panelRadius: getComputedStyle(panel).borderTopLeftRadius,
            prev: box(q('[aria-label="Annotation précédente"]')),
            next: box(q('[aria-label="Annotation suivante"]')),
            close: box(q('[aria-label="Fermer l\u2019annotation"]')),
            title: box(q('#annotation-drawer-title')),
            note: box(q('[data-annotation-note]')),
            quote: box(q('[data-annotation-quote]')),
          };
        })
      );

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }

    // Quatre accents, une seule ossature : les flèches, la fermeture, le
    // titre et la colonne de contenu gardent exactement la même géométrie.
    expect(rows.map((row) => row.accent)).toEqual(kinds.map(([, accent]) => accent));
    for (const row of rows) {
      expect(row.panelRadius).toBe('12px');
      expect(row.prev).toEqual(rows[0].prev);
      expect(row.next).toEqual(rows[0].next);
      expect(row.close).toEqual(rows[0].close);
      // Le libellé change de largeur (Officielle / Annotation / Surlignage) :
      // il est tronqué dans une colonne fixe, donc sa position ne bouge pas.
      expect({ x: row.title.x, y: row.title.y, h: row.title.h }).toEqual({
        x: rows[0].title.x,
        y: rows[0].title.y,
        h: rows[0].title.h,
      });
      expect(row.quote.x).toBe(rows[0].quote.x);
      expect(row.quote.w).toBe(rows[0].quote.w);
      expect({ x: row.note.x, y: row.note.y, w: row.note.w }).toEqual({
        x: rows[0].note.x,
        y: rows[0].note.y,
        w: rows[0].note.w,
      });
    }
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
