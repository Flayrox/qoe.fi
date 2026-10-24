import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../sanitize';

describe('sanitizeHtml — HTML produit par l’éditeur studio', () => {
  it('conserve les liens externes et leurs attributs de sécurité', () => {
    const html = sanitizeHtml(
      '<p>Source : <a href="https://exemple.fr/enquete" target="_blank" rel="noopener noreferrer">l’enquête</a></p>'
    );

    expect(html).toContain('href="https://exemple.fr/enquete"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('conserve les figures légendées, l’alt et le crédit photo', () => {
    const html = sanitizeHtml(
      '<figure data-article-image="true" data-credit="AFP">' +
        '<img src="https://cdn.qoe.fi/a.jpg" alt="Manifestation">' +
        '<figcaption>Devant la préfecture<span class="image-credit">© AFP</span></figcaption>' +
        '</figure>'
    );

    expect(html).toContain('<figure');
    expect(html).toContain('data-credit="AFP"');
    expect(html).toContain('alt="Manifestation"');
    expect(html).toContain('<figcaption>');
    expect(html).toContain('image-credit');
  });

  it('continue de supprimer les vecteurs XSS', () => {
    const html = sanitizeHtml(
      '<p onclick="alert(1)">ok</p><script>alert(1)</script><a href="javascript:alert(1)">lien</a>'
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });
});
