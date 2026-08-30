// @vitest-environment jsdom
// =====================================================================
// 🛡️ BANC DE TESTS UNITAIRES — ZOOMABLE LIGHTBOX (@qoe/ui)
// =====================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@lingui/core/macro', () => ({
  t: (str: unknown) => (Array.isArray(str) ? str[0] : String(str || '')),
}));
import {
  ZoomableLightbox,
  LightboxProvider,
  useZoomableLightbox,
} from '../social/ZoomableLightbox';

describe('🛡️ ZoomableLightbox — Rendu & Interactions Utilisateur', () => {
  const sampleImages = [
    { url: 'https://cdn.qoe.fi/articles/1/img1.webp', alt: 'Première illustration d’article' },
    { url: 'https://cdn.qoe.fi/articles/1/img2.webp', alt: 'Deuxième schéma explicatif' },
  ];

  it('ne rend rien lorsque isOpen est faux', () => {
    const { container } = render(
      <ZoomableLightbox isOpen={false} images={sampleImages} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('affiche correctement la première image et son compteur quand ouvert', () => {
    render(
      <ZoomableLightbox isOpen={true} images={sampleImages} initialIndex={0} onClose={() => {}} />
    );
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByAltText('Première illustration d’article')).toBeTruthy();
  });

  it('permet de naviguer vers l’image suivante et précédente via les boutons', () => {
    render(
      <ZoomableLightbox isOpen={true} images={sampleImages} initialIndex={0} onClose={() => {}} />
    );

    // Suivante
    const nextBtn = screen.getByTitle('Image suivante (Flèche droite)');
    fireEvent.click(nextBtn);
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByAltText('Deuxième schéma explicatif')).toBeTruthy();

    // Précédente
    const prevBtn = screen.getByTitle('Image précédente (Flèche gauche)');
    fireEvent.click(prevBtn);
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('ferme la visionneuse lorsqu’on appuie sur la touche Échap', () => {
    const handleClose = vi.fn();
    render(<ZoomableLightbox isOpen={true} images={sampleImages} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('affiche et masque le panneau d’Alt-Text au clic sur le bouton Info', () => {
    render(<ZoomableLightbox isOpen={true} images={sampleImages} onClose={() => {}} />);

    const infoBtn = screen.getByTitle("Afficher la description de l'image");
    fireEvent.click(infoBtn);

    expect(screen.getByText('Description de l’image')).toBeTruthy();
    expect(screen.getByText('Première illustration d’article')).toBeTruthy();
  });

  it('fournit un contexte global fonctionnel avec LightboxProvider', () => {
    function TestConsumer() {
      const { openLightbox } = useZoomableLightbox();
      return (
        <button type="button" onClick={() => openLightbox(['https://cdn.qoe.fi/test.webp'])}>
          Ouvrir
        </button>
      );
    }

    render(
      <LightboxProvider>
        <TestConsumer />
      </LightboxProvider>
    );

    const openBtn = screen.getByText('Ouvrir');
    fireEvent.click(openBtn);

    expect(screen.getByText('1 / 1')).toBeTruthy();
  });
});
