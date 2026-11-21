// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ArticlePreviewModal, type Article } from '../ArticlePreviewModal';

// L'aperçu d'article injecte le corps HTML de l'article dans la page.
// L'assainisseur doit bloquer les vecteurs réels, pas seulement les balises
// écrites en clair : une URI `javascript:` encodée en entités est décodée par
// le parseur HTML, donc elle s'exécute si elle traverse telle quelle.

const base: Article = {
  id: 'a1',
  title: 'Aperçu',
  content: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  author: { name: 'Clara Lambert', logoUrl: null },
  category: { name: 'Essai' },
};

// La modale est portée dans un portail (`document.body`) : on interroge le
// document, pas le conteneur du rendu.
function renderContent(content: string) {
  render(<ArticlePreviewModal article={{ ...base, content }} onClose={() => {}} />);
  return document.body;
}

describe('ArticlePreviewModal — assainissement du corps injecté', () => {
  it('neutralise une URI javascript: encodée en entités', () => {
    const container = renderContent(`<p><a href="&#106;avascript:alert(1)">clic</a></p>`);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    // Le navigateur décode `&#106;` en `j` : si le lien survit, il est exécutable.
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
  });

  it('neutralise une balise script non fermée', () => {
    const body = renderContent(`<p>ok</p><script src="https://evil.example/x.js">`);
    expect(body.querySelector('script')).toBeNull();
    expect(body.innerHTML).not.toContain('evil.example');
  });

  it('neutralise un gestionnaire d’événement écrit en majuscules', () => {
    const body = renderContent(`<p><img src="/a.png" ONERROR="alert(1)"></p>`);
    const img = body.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('onerror')).toBeNull();
  });
});
