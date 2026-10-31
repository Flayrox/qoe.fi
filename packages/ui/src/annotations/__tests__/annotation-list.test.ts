// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { appendAnnotation, dedupeAnnotations } from '../annotation-list';

interface Item {
  id: string;
  note: string | null;
}

const item = (id: string, note: string | null = null): Item => ({ id, note });

describe('annotation-list — une annotation a une identité', () => {
  it('ajoute une annotation absente, à la fin', () => {
    const list = [item('a'), item('b')];
    expect(appendAnnotation(list, item('c'))).toEqual([item('a'), item('b'), item('c')]);
  });

  it('ne double jamais le même identifiant — et rend la MÊME liste', () => {
    const list = [item('a')];
    const next = appendAnnotation(list, item('a', 'note arrivée plus tard'));

    // Même référence : c'est ce qui évite un re-rendu inutile et, en mode
    // document, une marque peinte deux fois (deux `<mark>` imbriqués de
    // mêmes classes et de même id — le trait doublait sans rien dire).
    expect(next).toBe(list);
    expect(next).toHaveLength(1);
  });
});

describe('annotation-list — assainir les listes venues de l’extérieur', () => {
  it('garde la première apparition de chaque identifiant, dans l’ordre', () => {
    const list = [item('a', 'première'), item('b'), item('a', 'seconde'), item('c')];
    expect(dedupeAnnotations(list)).toEqual([item('a', 'première'), item('b'), item('c')]);
  });

  it('rend la MÊME liste quand elle est déjà propre — pas de re-rendu inutile', () => {
    const list = [item('a'), item('b'), item('c')];
    expect(dedupeAnnotations(list)).toBe(list);
    expect(dedupeAnnotations([])).toEqual([]);
    expect(dedupeAnnotations([item('seul')])).toHaveLength(1);
  });
});
