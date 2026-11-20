// =====================================================================
// L21b — libellé du scope de page (panneau des calques vs canvas)
// =====================================================================
// Avant correctif, `LeftPanelFull` écrivait en dur « Page · Accueil » même
// sur le scope article/rubrique, pendant que le canvas annonçait
// « Article · essais ». Un seul état, deux libellés, dont un faux.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { stageScopeLabel, stageScopeTitle } from '../scope-label';

describe('stageScopeLabel', () => {
  it('nomme l’accueil sur le scope home', () => {
    expect(stageScopeLabel('home', null)).toBe('Accueil');
  });

  it('nomme la page article sans rubrique', () => {
    expect(stageScopeLabel('article', null)).toBe('Article');
  });

  it('nomme la page article avec sa rubrique', () => {
    expect(stageScopeLabel('article', 'essais')).toBe('Article · essais');
  });

  it('préfixe le titre du panneau avec le scope réel', () => {
    expect(stageScopeTitle('home', null)).toBe('Page · Accueil');
    expect(stageScopeTitle('article', 'essais')).toBe('Page · Article · essais');
  });
});
