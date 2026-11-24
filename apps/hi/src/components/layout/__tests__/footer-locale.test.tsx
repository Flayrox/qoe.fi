// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Le footer est un composant serveur : on lui passe la locale explicitement
// (aucun appel à next/headers), puis on rend le HTML statique.
vi.mock('@qoe/i18n/server', () => ({
  getLanguage: async () => 'fr',
}));

import { Footer } from '../Footer';

// La copie est résolue par le catalogue Lingui (mocké en source française dans
// vitest.setup). Ce qui se teste ici, c'est ce que le footer décide lui-même :
// les colonnes par défaut, la surcharge console et la langue mise en avant.
describe('Footer — langue mise en avant', () => {
  it('souligne la locale active, pas l’autre', async () => {
    const html = renderToStaticMarkup(await Footer({ config: {}, locale: 'en' }));
    expect(html).toContain('font-semibold text-foreground underline');
    // Les deux endonymes restent affichés dans leur propre langue.
    expect(html).toContain('Français');
    expect(html).toContain('English');
  });
});

describe('Footer — colonnes depuis la console', () => {
  it('affiche les colonnes par défaut quand la config est vide', async () => {
    const html = renderToStaticMarkup(await Footer({ config: {}, locale: 'fr' }));
    expect(html).toContain('Plateforme');
    expect(html).toContain('Tous droits réservés.');
  });

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
