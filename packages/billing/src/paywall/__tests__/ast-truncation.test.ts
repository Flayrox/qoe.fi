import { describe, it, expect } from 'vitest';
import { truncateArticleContentForPaywall } from '../ast-truncation';

describe('truncateArticleContentForPaywall', () => {
  const sampleArticleHtml = `
    <p>Ceci est l'introduction publique de l'article payant.</p>
    <p>Deuxième paragraphe gratuit lisible par tout le monde.</p>
    <div data-type="paywall-divider">--- Limite Paywall ---</div>
    <p>Ce contenu est STRICTEMENT réservé aux abonnés payants.</p>
    <p>Secrets de création et analyses financières confidentielles.</p>
  `;

  it('1. Returns full content for subscribers or non-premium articles', () => {
    const resultSub = truncateArticleContentForPaywall(sampleArticleHtml, {
      isPremium: true,
      isSubscriber: true,
    });

    expect(resultSub.isTruncated).toBe(false);
    expect(resultSub.content).toBe(sampleArticleHtml);
    expect(resultSub.content).toContain('Secrets de création');

    const resultFree = truncateArticleContentForPaywall(sampleArticleHtml, {
      isPremium: false,
      isSubscriber: false,
    });

    expect(resultFree.isTruncated).toBe(false);
    expect(resultFree.content).toBe(sampleArticleHtml);
  });

  it('2. Truncates content strictly BEFORE paywall divider for non-subscribers', () => {
    const result = truncateArticleContentForPaywall(sampleArticleHtml, {
      isPremium: true,
      isSubscriber: false,
    });

    expect(result.isTruncated).toBe(true);
    expect(result.content).toContain("Ceci est l'introduction publique");
    expect(result.content).toContain('Deuxième paragraphe gratuit');
    expect(result.content).not.toContain('STRICTEMENT réservé aux abonnés');
    expect(result.content).not.toContain('Secrets de création');
  });

  it('3. Supports <!-- paywall --> HTML comment pattern', () => {
    const commentHtml = `
      <p>Aperçu gratuit avant le commentaire.</p>
      <!-- paywall -->
      <p>Contenu secret après le commentaire paywall.</p>
    `;

    const result = truncateArticleContentForPaywall(commentHtml, {
      isPremium: true,
      isSubscriber: false,
    });

    expect(result.isTruncated).toBe(true);
    expect(result.content).toContain('Aperçu gratuit');
    expect(result.content).not.toContain('Contenu secret');
  });

  it('4. Applies paragraph fallback when no paywall marker is found', () => {
    const noMarkerHtml = `
      <p>Paragraphe 1 gratuit.</p>
      <p>Paragraphe 2 gratuit.</p>
      <p>Paragraphe 3 payant qui doit être tronqué.</p>
      <p>Paragraphe 4 payant.</p>
    `;

    const result = truncateArticleContentForPaywall(noMarkerHtml, {
      isPremium: true,
      isSubscriber: false,
      fallbackParagraphs: 2,
    });

    expect(result.isTruncated).toBe(true);
    expect(result.content).toContain('Paragraphe 1');
    expect(result.content).toContain('Paragraphe 2');
    expect(result.content).not.toContain('Paragraphe 3');
  });
});
