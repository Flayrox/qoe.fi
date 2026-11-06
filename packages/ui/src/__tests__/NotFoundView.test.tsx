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

  it('affiche les éléments essentiels de la nouvelle page 404 sobre', () => {
    render(<NotFoundView locale="fr" />);

    // Badge 404 sobre
    expect(screen.getByText('ERREUR 404')).toBeDefined();

    // Titre sobre & accessible
    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeDefined();

    // Sous-titre
    expect(
      screen.getByText('La page que vous cherchez n’existe pas ou a été déplacée.')
    ).toBeDefined();

    // Rendu vectoriel SVG officiel avec le logo Qoefi
    expect(screen.getByRole('img', { name: '404 — Page introuvable' })).toBeDefined();

    // Barre de recherche
    expect(screen.getByPlaceholderText('Rechercher sur qoefi...')).toBeDefined();

    // Boutons de rebond
    expect(screen.getByText('Retour à l’accueil')).toBeDefined();
    expect(screen.getByText('Page précédente')).toBeDefined();
  });

  it('prend en charge la locale anglaise correctement', () => {
    render(<NotFoundView locale="en" />);

    expect(screen.getByText('ERROR 404')).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeDefined();
    expect(
      screen.getByText('The page you are looking for does not exist or has been moved.')
    ).toBeDefined();
    expect(screen.getByText('Back to home')).toBeDefined();
    expect(screen.getByText('Go back')).toBeDefined();
  });

  it('permet de personnaliser le titre et la description via les props', () => {
    render(
      <NotFoundView
        locale="fr"
        title="Contenu introuvable"
        description="Cet article n'est plus accessible aux lecteurs."
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Contenu introuvable' })).toBeDefined();
    expect(screen.getByText("Cet article n'est plus accessible aux lecteurs.")).toBeDefined();
  });

  it('masque la barre de recherche lorsque showSearch=false', () => {
    render(<NotFoundView locale="fr" showSearch={false} />);

    expect(screen.queryByPlaceholderText('Rechercher sur qoefi...')).toBeNull();
  });

  it('soumet la recherche vers /search avec les mots-clés saisis', () => {
    render(<NotFoundView locale="fr" />);

    const searchInput = screen.getByPlaceholderText('Rechercher sur qoefi...');
    fireEvent.change(searchInput, { target: { value: 'philosophie du silence' } });

    const searchBtn = screen.getByText('Rechercher');
    fireEvent.click(searchBtn);

    expect(mockPush).toHaveBeenCalledWith('/search?q=philosophie%20du%20silence');
  });

  it('redirectionne vers /home via le bouton principal', () => {
    render(<NotFoundView locale="fr" />);

    const homeBtn = screen.getByText('Retour à l’accueil');
    fireEvent.click(homeBtn);

    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('permet de revenir en arrière avec le bouton retour', () => {
    render(<NotFoundView locale="fr" />);

    const backBtn = screen.getByText('Page précédente');
    fireEvent.click(backBtn);

    expect(mockPush.mock.calls.length + mockBack.mock.calls.length).toBeGreaterThan(0);
  });
});
