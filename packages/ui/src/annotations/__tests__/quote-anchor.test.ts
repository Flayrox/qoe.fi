// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { findQuoteOccurrence } from '../quote-anchor';

// Le surlignage qoe.fi n'a pas d'offsets stockés : l'ancre est le texte
// cité + son ordinal d'occurrence. Ces tests garantissent que la bonne
// occurrence est visée, avec repli sur la première si nécessaire.

function buildArticle(): HTMLElement {
  document.body.innerHTML = `
    <article id="content">
      <p id="p1">Le chat dort sur le tapis. Personne ne bouge.</p>
      <blockquote id="bq">« Le chat dort sur le tapis » — proverbe</blockquote>
      <p id="p2">Plus tard, le chat dormait encore.</p>
    </article>`;
  return document.getElementById('content')!;
}

describe('findQuoteOccurrence — ancrage par citation + ordinal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('ordinal 0 vise la première occurrence (paragraph 1)', () => {
    const root = buildArticle();
    const m = findQuoteOccurrence(root, 'Le chat dort sur le tapis', 0);
    expect(m).not.toBeNull();
    expect(m!.textNode.parentElement!.id).toBe('p1');
  });

  it('ordinal 1 vise la deuxième occurrence (blockquote)', () => {
    const root = buildArticle();
    const m = findQuoteOccurrence(root, 'Le chat dort sur le tapis', 1);
    expect(m).not.toBeNull();
    // La citation dans le blockquote est entourée de guillemets français.
    expect(m!.textNode.parentElement!.id).toBe('bq');
  });

  it('compte les occurrences répétées DANS un même nœud texte', () => {
    document.body.innerHTML = `
      <article><p>va-et-vient va-et-vient va-et-vient</p></article>`;
    const root = document.querySelector('article') as HTMLElement;

    expect(findQuoteOccurrence(root, 'va-et-vient', 0)!.index).toBe(0);
    expect(findQuoteOccurrence(root, 'va-et-vient', 1)!.index).toBe(12);
    expect(findQuoteOccurrence(root, 'va-et-vient', 2)!.index).toBe(24);
  });

  it('repli gracieux : ordinal inexistant → première occurrence', () => {
    const root = buildArticle();
    const m = findQuoteOccurrence(root, 'Personne ne bouge', 7);
    expect(m).not.toBeNull();
    expect(m!.textNode.textContent).toContain('Personne');
  });

  it('texte absent → null', () => {
    const root = buildArticle();
    expect(findQuoteOccurrence(root, 'passage introuvable', 0)).toBeNull();
  });

  it('texte vide → null', () => {
    const root = buildArticle();
    expect(findQuoteOccurrence(root, '', 0)).toBeNull();
  });

  it('tolère les espaces irréguliers aux extrémités (trim)', () => {
    const root = buildArticle();
    const m = findQuoteOccurrence(root, '  Le chat dort sur le tapis  ', 0);
    expect(m).not.toBeNull();
    expect(m!.textNode.parentElement!.id).toBe('p1');
  });
});
