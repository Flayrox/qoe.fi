// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreatorHub } from '../CreatorHub';

// `creator_hub_tabs` vient de la console (SystemConfig). Un JSON valide mais de
// forme inattendue (objet incomplet) ne doit pas casser la page d'accueil :
// la section retombe sur son contenu par défaut.

describe('CreatorHub — config custom mal formée', () => {
  it('retombe sur les onglets par défaut au lieu de planter', () => {
    const config = {
      creator_hub_tabs_fr: '[{"eyebrow":"E"},{"headline":"Sans features"}]',
    };
    expect(() => render(<CreatorHub config={config} />)).not.toThrow();
    expect(screen.getByText('Votre média en 3 minutes.')).toBeInTheDocument();
  });

  it('accepte une config custom complète', () => {
    const config = {
      creator_hub_tabs_fr: JSON.stringify([
        {
          eyebrow: 'Sur-mesure',
          headline: 'Titre console',
          body: 'Corps console',
          features: ['Point A'],
          cta: 'Aller',
          ctaHref: 'https://example.test',
        },
      ]),
    };
    render(<CreatorHub config={config} />);
    expect(screen.getByText('Titre console')).toBeInTheDocument();
    expect(screen.getByText('Point A')).toBeInTheDocument();
  });
});
