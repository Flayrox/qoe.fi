// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotFoundView } from '../NotFoundView';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

describe('NotFoundView', () => {
  it('affiche les éléments cardinaux de la page 404 littéraire', () => {
    render(<NotFoundView locale="fr" />);

    // Badge 404
    expect(screen.getByText('PIÈCE MANQUANTE #404')).toBeDefined();

    // Titre
    expect(screen.getByText('Manuscrit introuvable dans les archives')).toBeDefined();

    // Barre de recherche
    expect(
      screen.getByPlaceholderText('Rechercher un auteur, une publication, un sujet...')
    ).toBeDefined();

    // Boutons de rebond
    expect(screen.getByText('Reprendre le fil')).toBeDefined();
    expect(screen.getByText('Explorer les écrits')).toBeDefined();
  });

  it('prend en charge la locale anglaise correctement', () => {
    render(<NotFoundView locale="en" />);

    expect(screen.getByText('MISSING LEAF #404')).toBeDefined();
    expect(screen.getByText('Manuscript missing from the archives')).toBeDefined();
    expect(screen.getByText('Back to feed')).toBeDefined();
  });

  it('permet de tirer une autre hypothèse de disparition', () => {
    render(<NotFoundView locale="fr" />);

    const rollBtn = screen.getByText('Autre explication');
    expect(rollBtn).toBeDefined();
    fireEvent.click(rollBtn);
  });

  it('soumet la recherche vers /search avec les mots-clés saisis', () => {
    render(<NotFoundView locale="fr" />);

    const searchInput = screen.getByPlaceholderText(
      'Rechercher un auteur, une publication, un sujet...'
    );
    fireEvent.change(searchInput, { target: { value: 'camus et l’absurde' } });

    const searchBtn = screen.getByText('Rechercher');
    fireEvent.click(searchBtn);

    expect(mockPush).toHaveBeenCalledWith('/search?q=camus%20et%20l%E2%80%99absurde');
  });

  it('redirectionne vers /home via le bouton principal', () => {
    render(<NotFoundView locale="fr" />);

    const homeBtn = screen.getByText('Reprendre le fil');
    fireEvent.click(homeBtn);

    expect(mockPush).toHaveBeenCalledWith('/home');
  });
});
