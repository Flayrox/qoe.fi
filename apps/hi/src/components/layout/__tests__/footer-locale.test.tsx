// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Le footer est un composant serveur : on lui passe la locale explicitement
// (aucun appel à next/headers), puis on rend le HTML statique.
vi.mock('@qoe/i18n/server', () => ({
  getLanguage: async () => 'fr',
}));

import { Footer } from '../Footer';

describe('Footer — langue du texte de bas de page', () => {
  it('n’affiche aucun texte français quand la locale est anglaise', async () => {
    const html = renderToStaticMarkup(await Footer({ config: {}, locale: 'en' }));
    expect(html).not.toContain('Tous droits réservés');
    expect(html).toContain('All rights reserved');
  });

  it('affiche le texte français quand la locale est française', async () => {
    const html = renderToStaticMarkup(await Footer({ config: {}, locale: 'fr' }));
    expect(html).toContain('Tous droits réservés');
  });
});

describe('Footer — colonnes depuis la console', () => {
  it('ignore une section de forme inattendue au lieu de planter', async () => {
    const config = { footer_sections: '[null, {"title":"Sans liens"}, {"links":[]}]' };
    const html = renderToStaticMarkup(await Footer({ config, locale: 'fr' }));
    expect(html).toContain('Plateforme');
  });

  it('affiche les colonnes personnalisées quand elles sont valides', async () => {
    const config = {
      footer_sections: JSON.stringify([
        { title: 'Colonne console', links: [{ label: 'Lien console', href: '/ici' }] },
      ]),
    };
    const html = renderToStaticMarkup(await Footer({ config, locale: 'fr' }));
    expect(html).toContain('Colonne console');
    expect(html).toContain('href="/ici"');
    expect(html).not.toContain('Plateforme');
  });
});
