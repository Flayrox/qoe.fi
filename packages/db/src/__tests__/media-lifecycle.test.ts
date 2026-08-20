// =====================================================================
// 🛡️ BANC DE TESTS UNITAIRES — CYCLE DE VIE & RÉTENTION FINOPS (@qoe/db)
// =====================================================================

import { describe, it, expect } from 'vitest';
import { extractImageUrlsFromHtml } from '../repositories/media';

describe('🛡️ Media Lifecycle & FinOps — Extraction d’URLs HTML TipTap', () => {
  it('extrait fidèlement toutes les images d’un corps d’article HTML riche', () => {
    const html = `
      <p>Introduction à l'article...</p>
      <img src="https://cdn.qoe.fi/articles/user1/image-1.webp" alt="Graphique 1" />
      <p>Second paragraphe avec une autre image dans un conteneur figure :</p>
      <figure>
        <img src="https://cdn.qoe.fi/articles/user1/image-2.webp" alt="Schéma" />
        <figcaption>Légende</figcaption>
      </figure>
      <p>Fin du document.</p>
    `;

    const extracted = extractImageUrlsFromHtml(html);
    expect(extracted).toHaveLength(2);
    expect(extracted).toContain('https://cdn.qoe.fi/articles/user1/image-1.webp');
    expect(extracted).toContain('https://cdn.qoe.fi/articles/user1/image-2.webp');
  });

  it('retourne un tableau vide quand le contenu HTML ne contient aucune image ou est vide', () => {
    expect(extractImageUrlsFromHtml('')).toEqual([]);
    expect(extractImageUrlsFromHtml(null)).toEqual([]);
    expect(extractImageUrlsFromHtml(undefined)).toEqual([]);
    expect(extractImageUrlsFromHtml('<p>Simple texte sans image</p>')).toEqual([]);
  });

  it('gère les attributs d’images avec apostrophes et guillemets doubles sans faille regex', () => {
    const mixedHtml = `
      <img src='https://cdn.qoe.fi/thoughts/user2/photo.webp' />
      <img class="hero-img" src="https://cdn.qoe.fi/banners/user3/cover.webp" loading="lazy" />
    `;

    const urls = extractImageUrlsFromHtml(mixedHtml);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://cdn.qoe.fi/thoughts/user2/photo.webp');
    expect(urls[1]).toBe('https://cdn.qoe.fi/banners/user3/cover.webp');
  });
});
