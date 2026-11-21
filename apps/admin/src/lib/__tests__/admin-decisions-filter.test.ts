// =====================================================================
// 🧪 Filtre « refus uniquement » des décisions d'autorisation
// =====================================================================
// Une case à cocher ne s'envoie que cochée : en écrivant `denied=1` pour « refus
// seuls », l'écran ne pouvait jamais relâcher le filtre ni montrer les décisions
// accordées. C'est donc l'état « tout afficher » que la case transporte.
// =====================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseOnlyDenied } from '../admin-decisions-filter';

const PAGE = readFileSync(
  fileURLToPath(new URL('../../app/(admin)/admin/access/decisions/page.tsx', import.meta.url)),
  'utf8'
);

describe('décisions — filtre « refus uniquement »', () => {
  it('la case transporte l’état « toutes les décisions »', () => {
    expect(PAGE).toContain('name="denied"');
    expect(PAGE).toContain('value="all"');
    expect(PAGE).toContain('defaultChecked={!onlyDenied}');
  });
});

describe('parseOnlyDenied — lecture des deux valeurs', () => {
  it('garde les refus seuls quand rien n’est dit (lien partagé)', () => {
    expect(parseOnlyDenied(undefined)).toBe(true);
    expect(parseOnlyDenied([])).toBe(true);
  });

  it('cochée = toutes les décisions, absente = refus seuls', () => {
    expect(parseOnlyDenied('all')).toBe(false);
    expect(parseOnlyDenied('1')).toBe(true);
    // Lien partagé avec l'ancienne case : « refus uniquement » décoché.
    expect(parseOnlyDenied('0')).toBe(false);
  });
});
