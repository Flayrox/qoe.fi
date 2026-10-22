import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutPageContent } from '../blocks/AboutPageContent';

describe('AboutPageContent', () => {
  it('affiche le contenu personnalisable de la page À Propos avec widget d’abonnement et section People', () => {
    const mockPublication = {
      id: 'pub-1',
      name: 'The Rose Period',
      slug: 'the-rose-period',
      heroText: 'Chroniques artistiques inattendues et récits intimes.',
      bio: 'Fondé à Paris en 2026.',
      isCertified: true,
      logoUrl: 'https://example.com/logo.jpg',
      author: {
        name: 'Rose Florence',
        username: 'roseflorence',
        avatarUrl: 'https://example.com/rose.jpg',
        bio: 'Fondatrice et directrice éditoriale.',
      },
    };

    const html = renderToStaticMarkup(
      <AboutPageContent
        publication={mockPublication}
        customConfig={{
          title: 'Manifeste éditorial de The Rose Period',
          showSubscribeWidget: true,
          peopleTitle: 'Membres fondateurs',
        }}
      />
    );

    expect(html).toContain('data-testid="about-page-content"');
    expect(html).toContain('Manifeste éditorial de The Rose Period');
    expect(html).toContain('Chroniques artistiques inattendues et récits intimes.');
    expect(html).toContain('Fondé à Paris en 2026.');
    expect(html).toContain('Recevez les prochains numéros');
    expect(html).toContain('Membres fondateurs');
    expect(html).toContain('Rose Florence');
  });

  it('affiche le corps rédigé d’un article riche quand articleContent est renseigné', () => {
    const mockPublication = {
      id: 'pub-2',
      name: 'Les Chroniques',
      slug: 'les-chroniques',
      isCertified: false,
    };

    const richHtml = '<h2>Notre Mission</h2><p>Une rédaction indépendante et libre.</p>';

    const html = renderToStaticMarkup(
      <AboutPageContent
        publication={mockPublication}
        articleContent={richHtml}
        articleTitle="À propos de notre revue"
      />
    );

    expect(html).toContain('data-testid="about-article-body"');
    expect(html).toContain('<h2>Notre Mission</h2>');
    expect(html).toContain('Une rédaction indépendante et libre.');
    expect(html).toContain('À propos de notre revue');
  });
});
