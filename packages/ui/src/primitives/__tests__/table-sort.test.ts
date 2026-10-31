import { describe, expect, it } from 'vitest';

import { compareCell, sortRows, type SortSpec } from '../table/sort';

interface Row {
  id: string;
  title: string;
  views: string | number;
  role?: string | null;
  published?: string | null;
}

const spec: SortSpec<Row> = {
  title: { kind: 'text', value: (row) => row.title },
  views: { kind: 'number', value: (row) => row.views },
  role: {
    kind: 'rank',
    rank: ['propriétaire', 'éditeur', 'contributeur', 'lecteur'],
    value: (row) => row.role,
  },
  published: { kind: 'date', value: (row) => row.published },
};

const rows: Row[] = [
  { id: '1', title: 'Écrire contre l’algorithme', views: '1 420', role: 'lecteur' },
  { id: '2', title: 'le bruit des claviers', views: '9', role: 'propriétaire' },
  { id: '3', title: 'Éphémère Durand', views: 10, role: 'éditeur' },
  { id: '4', title: 'Zola relu', views: '0', role: null },
];

describe('sortRows — le tri suit la nature de la colonne', () => {
  it('classe le texte en français, sans buter sur les accents ni la casse', () => {
    const ids = sortRows(rows, { column: 'title', direction: 'ascending' }, spec).map((r) => r.id);
    // « écrire » < « éphémère » < « le bruit » < « zola » : les accents ne
    // changent pas la lettre de classement, et la casse ne compte pas.
    expect(ids).toEqual(['1', '3', '2', '4']);
  });

  it('inverse le texte en descendant', () => {
    const ids = sortRows(rows, { column: 'title', direction: 'descending' }, spec).map((r) => r.id);
    expect(ids).toEqual(['4', '2', '3', '1']);
  });

  it('lit « 1 420 » et « 9 » comme des nombres, pas comme du texte', () => {
    const ids = sortRows(rows, { column: 'views', direction: 'ascending' }, spec).map((r) => r.id);
    expect(ids).toEqual(['4', '2', '3', '1']);
  });

  it('respecte l’ordre métier d’un rôle, jamais l’alphabétique', () => {
    const ids = sortRows(rows, { column: 'role', direction: 'ascending' }, spec).map((r) => r.id);
    // propriétaire > éditeur > lecteur > (sans rôle, en fin)
    expect(ids).toEqual(['2', '3', '1', '4']);
  });

  it('garde les dates absentes en fin de liste dans les deux sens', () => {
    const dated: Row[] = [
      { id: 'a', title: 'A', views: 0, published: '2026-01-02' },
      { id: 'b', title: 'B', views: 0, published: null },
      { id: 'c', title: 'C', views: 0, published: '2026-03-01' },
    ];

    expect(
      sortRows(dated, { column: 'published', direction: 'ascending' }, spec).map((r) => r.id)
    ).toEqual(['a', 'c', 'b']);
    expect(
      sortRows(dated, { column: 'published', direction: 'descending' }, spec).map((r) => r.id)
    ).toEqual(['c', 'a', 'b']);
  });

  it('ne modifie pas le tableau reçu', () => {
    const original = rows.map((row) => row.id);
    sortRows(rows, { column: 'views', direction: 'descending' }, spec);
    expect(rows.map((row) => row.id)).toEqual(original);
  });

  it('conserve l’ordre d’origine pour les ex æquo', () => {
    const tied: Row[] = [
      { id: 'x', title: 'Même', views: 3 },
      { id: 'y', title: 'Même', views: 3 },
      { id: 'z', title: 'Même', views: 3 },
    ];
    expect(
      sortRows(tied, { column: 'views', direction: 'descending' }, spec).map((r) => r.id)
    ).toEqual(['x', 'y', 'z']);
  });

  it('ignore une colonne non déclarée au lieu de deviner', () => {
    const ids = sortRows(rows, { column: 'inconnue', direction: 'ascending' }, spec).map(
      (r) => r.id
    );
    expect(ids).toEqual(['1', '2', '3', '4']);
  });
});

describe('compareCell — les cas qui piègent un tri naïf', () => {
  it('« 10 » vient après « 9 »', () => {
    expect(compareCell('10', '9', { kind: 'number', value: () => 0 })).toBeGreaterThan(0);
  });

  it('« Émile » se classe après « Zoé » en UTF-16, pas avec le collateur français', () => {
    // La preuve que `<` ne suffit pas : le point de code de É (201) dépasse Z (90).
    expect('Émile' < 'Zoé').toBe(false);
    expect(compareCell('Émile', 'Zoé', { kind: 'text', value: () => 0 })).toBeLessThan(0);
  });

  it('tolère les espaces fines des nombres français', () => {
    expect(compareCell('1 420', '1 421', { kind: 'number', value: () => 0 })).toBeLessThan(0);
  });
});
