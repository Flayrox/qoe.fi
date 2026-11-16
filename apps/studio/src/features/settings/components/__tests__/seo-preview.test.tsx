// =====================================================================
// 🧪 SeoPreview — ce que verront vraiment Google et les cartes de partage
// =====================================================================
// L'aperçu ne doit jamais mentir : sans surcharge il montre le nom + le
// slogan déjà générés, et il rappelle l'indexation coupée au lieu de
// laisser croire que le site sortira dans les résultats.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SeoPreview } from '../seo-preview';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('@/components/studio-page', () => ({
  StudioSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

const base = {
  name: 'Le Média',
  subdomain: 'lemedia',
  customDomain: null,
  seoTitle: null,
  seoDescription: null,
  heroText: 'Analyses indépendantes',
  headerImageUrl: null,
  logoUrl: null,
  allowIndexing: true,
};

describe('SeoPreview', () => {
  it('compose le titre et la description depuis le nom et le slogan par défaut', () => {
    render(<SeoPreview {...base} />);

    expect(
      screen.getByRole('heading', { name: 'Le Média — Analyses indépendantes' })
    ).toBeDefined();
    expect(screen.getByText('Analyses indépendantes')).toBeDefined();
    expect(screen.getByText('lemedia.qoe.fi')).toBeDefined();
  });

  it('privilégie le domaine personnalisé et les surcharges SEO', () => {
    render(
      <SeoPreview
        {...base}
        customDomain="media.example.org"
        seoTitle="Titre surchargé"
        seoDescription="Description surchargée"
      />
    );

    expect(screen.getByText('media.example.org')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Titre surchargé' })).toBeDefined();
    expect(screen.getByText('Description surchargée')).toBeDefined();
  });

  it('retombe sur des valeurs neutres quand tout est vide', () => {
    render(
      <SeoPreview
        {...base}
        name={null}
        subdomain={null}
        heroText={null}
        seoTitle="   "
        seoDescription="   "
      />
    );

    expect(screen.getByRole('heading', { name: 'Ma publication' })).toBeDefined();
    expect(screen.getByText('publisher.qoe.fi')).toBeDefined();
    expect(
      screen.getByText('Publishers, analyses et articles de cette publication.')
    ).toBeDefined();
  });

  it('signale l’indexation désactivée sans masquer l’aperçu', () => {
    render(<SeoPreview {...base} allowIndexing={false} />);

    expect(screen.getByText(/L'indexation est désactivée/i)).toBeDefined();
    expect(screen.getByRole('heading', { name: /Le Média/ })).toBeDefined();
  });

  it('bascule sur la carte de partage', () => {
    render(<SeoPreview {...base} allowIndexing={true} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Carte de partage' }));

    expect(screen.queryByText(/L'indexation est désactivée/i)).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Le Média — Analyses indépendantes' })
    ).toBeDefined();
    // Sans image d'en-tête, la carte affiche un repli lisible (pas un vide).
    expect(screen.getByText('Le Média')).toBeDefined();
  });
});
