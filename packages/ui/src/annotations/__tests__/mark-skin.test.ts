import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MARK_ACCENT_TOKENS,
  MARK_KINDS,
  MARK_STYLE_CLASSES,
  markKindFor,
  markSkin,
  markSkinFor,
} from '../mark-skin';

// Vitest tourne avec `packages/ui` pour racine : le chemin reste stable ici.
const MARKS_CSS = readFileSync(resolve(process.cwd(), '../theme/src/styles/marks.css'), 'utf8');
const ARTICLE_CSS = readFileSync(resolve(process.cwd(), '../theme/src/styles/article.css'), 'utf8');

describe('markSkin', () => {
  it('donne à chaque nature la recette commune et son propre trait', () => {
    const strokeClasses = MARK_KINDS.map((kind) => {
      const classes = markSkin(kind);
      expect(classes.split(' ')).toContain('qoe-mark');
      const stroke = classes.split(' ').find((c) => c.startsWith('qoe-mark-'));
      expect(stroke).toBeTruthy();
      return stroke;
    });

    // Aucune nature ne peut emprunter le trait d'une autre : c'est ce qui
    // rend les natures distinctes autrement que par la teinte.
    expect(new Set(strokeClasses).size).toBe(MARK_KINDS.length);
  });

  it('expose exactement la même carte que l’accès par fonction', () => {
    for (const kind of MARK_KINDS) {
      expect(markSkin(kind)).toBe(MARK_STYLE_CLASSES[kind]);
    }
  });

  it('ne laisse aucune bordure héritée du rendu précédent', () => {
    // Les anciennes classes dessinaient un `border-b` : il doublonnait le
    // trait et se cassait en pointillés sur les citations multi-lignes.
    for (const kind of MARK_KINDS) {
      expect(markSkin(kind)).not.toMatch(/\bborder-b\b/);
    }
  });

  it('décide la nature sur le texte, pas sur la liste qui porte la marque', () => {
    // Un surlignage public sans note n'est pas une annotation publique.
    expect(markKindFor({ isPublic: true, hasNote: false })).toBe('highlight');
    // Un surlignage privé avec une note est une annotation privée.
    expect(markKindFor({ isPublic: false, hasNote: true })).toBe('private');
    // Une annotation publique avec une note est publique.
    expect(markKindFor({ isPublic: true, hasNote: true })).toBe('public');
    // La marque de l'auteur reste officielle, note ou pas.
    expect(markKindFor({ isOfficial: true, hasNote: false })).toBe('official');
    expect(markKindFor({ isOfficial: true, isPublic: true, hasNote: true })).toBe('official');

    expect(markSkinFor({ isPublic: false, hasNote: false })).toBe(MARK_STYLE_CLASSES.highlight);
  });

  it('ne laisse au composant aucune décision de teinte ou de police', () => {
    // Les quatre états sont dans le CSS : une classe `bg-*` ou `font-*`
    // posée par un appelant est exactement le défaut qu'on veut rendre
    // impossible.
    for (const kind of MARK_KINDS) {
      const classes = markSkin(kind);
      expect(classes).not.toMatch(/\bbg-/);
      expect(classes).not.toMatch(/\bfont-|\bitalic\b/);
    }
  });

  it('expose un token d’accent par nature, pour le tiroir et les légendes', () => {
    // Le tiroir ne recopie pas la palette : il pose ce token sur son
    // panneau, puis ses trois surfaces lisent `--qoe-annotation-accent`.
    expect(MARK_ACCENT_TOKENS).toEqual({
      official: '--annotation-official',
      public: '--annotation-public',
      private: '--annotation-private',
      highlight: '--annotation-highlight',
      selection: '--brand-vivid',
    });
  });
});

describe('marks.css', () => {
  it('définit la teinte et le trait de chaque nature utilisée par le composant', () => {
    // Contrat entre les deux paquets : une classe produite par `markSkin`
    // sans règle CSS est un surlignage sans peau, et rien ne le signale.
    for (const kind of MARK_KINDS) {
      expect(MARKS_CSS).toContain(`.qoe-mark-${kind}`);
      const block =
        MARKS_CSS.match(new RegExp(`\\.qoe-mark-${kind}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? '';
      expect(block).toContain('--qoe-mark-tint:');
      expect(block).toContain('--qoe-mark-tint-hover:');
      expect(block).toContain('--qoe-mark-stroke:');
    }
  });

  it('verrouille la typographie et la couleur du texte de la marque', () => {
    // Le style utilisateur de `<mark>` peint un fond jaune et un texte noir.
    // `color: inherit` rend la couleur du passage ; `font: inherit` rend sa
    // police, sa graisse et son interligne. Sans ces deux lignes, la marque
    // change la lecture du paragraphe.
    expect(MARKS_CSS).toContain('color: inherit;');
    expect(MARKS_CSS).toContain('font: inherit;');
    expect(MARKS_CSS).not.toMatch(/font-weight:\s*(500|600|700)/);
    expect(MARKS_CSS).not.toContain('font-style:');
  });

  it('répète le tracé sur chaque fragment de ligne', () => {
    expect(MARKS_CSS).toContain('box-decoration-break: clone');
    expect(MARKS_CSS).toContain('background-repeat: no-repeat');
  });

  it('ne dépend d’aucun filtre SVG', () => {
    // Un filtre dans un data-URI n'est pas rendu de façon fiable (Safari) :
    // le tracé doit être cuit dans le chemin, pas calculé au rendu.
    expect(MARKS_CSS).not.toContain('filter=');
    expect(MARKS_CSS).not.toContain('feTurbulence');
  });

  it('définit les deux surfaces du tiroir sur le même accent', () => {
    // Sans ces classes, le tiroir retomberait sur les couleurs codées en
    // dur de son composant, et une annotation privée ouvrirait un panneau
    // vermillon alors que sa marque est bleue.
    expect(MARKS_CSS).toContain('.qoe-annotation-dot');
    expect(MARKS_CSS).toContain('.qoe-annotation-quote');
    expect(MARKS_CSS).toContain('var(--qoe-annotation-accent)');
  });

  it('ne laisse pas la peau générique de l’article écraser les quatre états', () => {
    // ⚠️ Régression constatée : `.article-prose mark` (0,1,1) battait
    // `.qoe-mark` (0,1,0) et repeignait toutes les marques en ambre, sans
    // trait ni padding. La règle de repli ne doit viser que les marques
    // servies avant l'hydratation, encore sans `qoe-mark`.
    expect(ARTICLE_CSS).toContain('.article-prose mark:not(.qoe-mark)');
    expect(ARTICLE_CSS).not.toMatch(/\.article-prose mark\s*\{/);
  });
});
