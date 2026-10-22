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
});
