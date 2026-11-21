// @vitest-environment node
// =====================================================================
// 🧪 Identifiants protégés — le champ texte fait un aller-retour fidèle
// =====================================================================
// Le formulaire « Protected identifiers » convertit un texte multiligne en
// liste (et l'inverse). Les deux conversions étaient écrites avec des
// séquences échappées une fois de trop : la liste s'affichait sur une seule
// ligne (`admin\napi\nwww`) et, à l'enregistrement, tout le texte devenait UN
// identifiant — la liste des sous-domaines réservés cessait alors de protéger
// quoi que ce soit.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { formatReservedIdentifiers, splitReservedIdentifiers } from '../reserved-identifiers';

describe('identifiants protégés', () => {
  it('relit un identifiant par ligne', () => {
    expect(splitReservedIdentifiers('admin\napi\nwww')).toEqual(['admin', 'api', 'www']);
  });

  it('accepte les virgules et les espaces', () => {
    expect(splitReservedIdentifiers('admin, api www')).toEqual(['admin', 'api', 'www']);
  });

  it('normalise la casse et ignore les lignes vides', () => {
    expect(splitReservedIdentifiers(' Admin \n\n API ')).toEqual(['admin', 'api']);
  });

  it('réaffiche la liste sur une ligne par identifiant', () => {
    expect(formatReservedIdentifiers(['admin', 'api', 'www'])).toBe('admin\napi\nwww');
  });

  it('fait un aller-retour fidèle', () => {
    const list = ['admin', 'api', 'www'];
    expect(splitReservedIdentifiers(formatReservedIdentifiers(list))).toEqual(list);
  });
});
