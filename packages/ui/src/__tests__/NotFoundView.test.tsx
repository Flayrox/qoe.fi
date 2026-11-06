// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotFoundView } from '../NotFoundView';

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: mockBack,
  }),
}));

describe('NotFoundView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche l’animation SVG 404 avec le logo Qoefi et le bouton minimaliste de retour', () => {
    render(<NotFoundView locale="fr" />);

    // Rendu vectoriel SVG officiel avec le logo Qoefi
    expect(screen.getByRole('img', { name: '404 — Page introuvable' })).toBeDefined();

    // Bouton minimaliste de retour à l'accueil
    expect(screen.getByRole('button', { name: /Retour à l’accueil/i })).toBeDefined();

    // Pas de texte verbeux ni de barre de recherche
    expect(screen.queryByPlaceholderText(/Rechercher/i)).toBeNull();
    expect(screen.queryByText('ERREUR 404')).toBeNull();
  });

  it('prend en charge la locale anglaise correctement', () => {
    render(<NotFoundView locale="en" />);

    expect(screen.getByRole('button', { name: /Back to home/i })).toBeDefined();
  });

  it('redirectionne vers /home via le bouton minimaliste', () => {
    render(<NotFoundView locale="fr" />);

    const homeBtn = screen.getByRole('button', { name: /Retour à l’accueil/i });
    fireEvent.click(homeBtn);

    expect(mockPush).toHaveBeenCalledWith('/home');
  });
});
