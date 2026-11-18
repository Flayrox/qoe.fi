// @vitest-environment jsdom
// =====================================================================
// ⏱️ Délai d'infobulle — la règle que le provider ne participait pas
// =====================================================================
// 📖 `TooltipProvider delay={…}` n'était lu par personne : les 450 ms de
//    l'éditeur et les 100 ms du teaser de fonctionnalité tombaient dans le
//    défaut de `Tooltip`. La résolution est une fonction pure, testée ici
//    sans horloge (les assertions de temps réel sur les survols de jsdom
//    sont instables, et une horloge factice ne prouve pas le câblage).
// =====================================================================

import { describe, expect, it } from 'vitest';

import { resolveTooltipDelay } from '../tooltip';

describe('resolveTooltipDelay', () => {
  it('préfère le délai de l’infobulle', () => {
    expect(resolveTooltipDelay(450, 100)).toBe(450);
  });

  it('retombe sur le délai du provider', () => {
    expect(resolveTooltipDelay(undefined, 100)).toBe(100);
  });

  it('utilise le défaut quand personne ne décide', () => {
    expect(resolveTooltipDelay(undefined, undefined)).toBe(300);
  });
});
