// =====================================================================
// 🧪 EditorHeader — état réel de l'article et actions autorisées
// =====================================================================
// L'en-tête est le tableau de bord de l'auteur : statut, sauvegarde,
// co-édition, et surtout le bon bouton primaire selon son rôle (publier,
// mettre à jour ou soumettre). On vérifie chaque variante et chaque action.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? values[i] : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

import { EditorHeader } from '../EditorHeader';

function baseProps(overrides: Partial<React.ComponentProps<typeof EditorHeader>> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onOpenAnalytics: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenReaderPreview: vi.fn(),
    onToggleSettings: vi.fn(),
    onOpenSchedule: vi.fn(),
    onTogglePremium: vi.fn(),
    onPublish: vi.fn(),
    onUpdateLive: vi.fn(),
    onSubmitReview: vi.fn(),
    onOpenDiff: vi.fn(),
    onSave: vi.fn(),
    onRetryAutoSave: vi.fn(),
    onRetryCollaboration: vi.fn(),
  };
  const props = {
    isNew: false,
    isPremium: false,
    published: false,
    status: 'DRAFT',
    scheduledAt: null,
    capabilities: undefined,
    collaborationConnected: true,
    collaborationPeerCount: 0,
    collaborationStatus: 'connected' as const,
    collaborationSynced: true,
    collaborationUnsyncedChanges: 0,
    collaborationError: null,
    showCollaboration: false,
    isSaving: false,
    autoSaveStatus: 'idle' as const,
    autoSaveError: null,
    hasUnsavedChanges: false,
    lastSaved: null,
    settingsOpen: false,
    ...handlers,
    ...overrides,
  } as React.ComponentProps<typeof EditorHeader>;
  return { props, handlers };
}

function renderHeader(overrides: Partial<React.ComponentProps<typeof EditorHeader>> = {}) {
  const { props, handlers } = baseProps(overrides);
  render(<EditorHeader {...props} />);
  // Les overrides du test remplacent les callbacks par défaut : on renvoie
  // ceux réellement branchés, sinon les assertions visent les mauvais espions.
  return { ...handlers, ...overrides } as typeof handlers;
}

const button = (name: RegExp | string) => screen.getByRole('button', { name });

afterEach(() => {
  cleanup();
});

describe('EditorHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('distingue un nouvel écrit d’une édition', () => {
    renderHeader({ isNew: true });
    expect(screen.getByRole('heading', { name: 'Nouvel écrit' })).toBeDefined();
  });

  it('n’affiche le retour que s’il existe', () => {
    const { onBack } = renderHeader();
    fireEvent.click(button('Retour'));
    expect(onBack).toHaveBeenCalledTimes(1);

    cleanup();
    render(<EditorHeader {...baseProps({ onBack: undefined }).props} />);
    expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull();
  });

  it('affiche le statut éditorial exact', () => {
    renderHeader({ published: true, status: 'PUBLISHED' });
    expect(screen.getByText('En ligne')).toBeDefined();

    cleanup();
    renderHeader({ status: 'SUBMITTED' });
    expect(screen.getByText('En revue')).toBeDefined();

    cleanup();
    renderHeader({ status: 'SCHEDULED', scheduledAt: '2026-12-24T18:30:00.000Z' });
    expect(screen.getByText(/^Programmé ·/)).toBeDefined();

    cleanup();
    renderHeader({ status: 'SCHEDULED', scheduledAt: null });
    expect(screen.getByText('Programmé')).toBeDefined();

    cleanup();
    renderHeader();
    expect(screen.getByText('Brouillon')).toBeDefined();
  });

  it('n’affiche pas un séparateur orphelin quand la date programmée est illisible', () => {
    renderHeader({ status: 'SCHEDULED', scheduledAt: 'pas-une-date' });

    // Avant correction : « Programmé · » suivi de rien.
    expect(screen.getByText('Programmé')).toBeDefined();
    expect(screen.queryByText(/Programmé ·\s*$/)).toBeNull();
  });

  it('rend l’état de sauvegarde lisible sans ambiguïté', () => {
    renderHeader({ isSaving: true });
    expect(screen.getByText('Enregistrement…')).toBeDefined();

    cleanup();
    renderHeader({ autoSaveStatus: 'saving' });
    expect(screen.getByText('Enregistrement…')).toBeDefined();
  });

  it('expose l’erreur d’enregistrement et permet de réessayer', () => {
    const { onRetryAutoSave } = renderHeader({
      autoSaveStatus: 'error',
      autoSaveError: 'réseau coupé',
    });

    expect(screen.getByText(/Échec de l'enregistrement — réseau coupé/)).toBeDefined();
    fireEvent.click(button(/Réessayer/));
    expect(onRetryAutoSave).toHaveBeenCalledTimes(1);
  });

  it('horodate la dernière sauvegarde', () => {
    const lastSaved = new Date(2026, 10, 16, 9, 5, 0);
    renderHeader({ lastSaved });

    expect(screen.getByText(/Sauvegardé à/)).toBeDefined();
    expect(screen.getByText(new RegExp(lastSaved.toLocaleTimeString()))).toBeDefined();
  });

  it('signale les modifications en cours et l’enregistrement auto terminé', () => {
    renderHeader({ hasUnsavedChanges: true });
    expect(screen.getByText(/Modifications en cours…/)).toBeDefined();

    cleanup();
    renderHeader({ autoSaveStatus: 'saved', lastSaved: new Date(2026, 10, 16, 9, 5) });
    expect(screen.getByText(/Brouillon enregistré/)).toBeDefined();
  });

  it('désactive « Enregistrer » pendant une sauvegarde', () => {
    renderHeader({ isSaving: true });
    expect((button(/^Enregistrer$/i) as HTMLButtonElement).disabled).toBe(true);
  });

  it('branche toutes les actions de la barre', () => {
    const handlers = renderHeader({ onOpenHistory: vi.fn(), previewHref: '/preview/art-1' });

    fireEvent.click(button('Analyses'));
    fireEvent.click(button('Historique de publication'));
    fireEvent.click(button('Programmer'));
    fireEvent.click(button('Article gratuit'));
    fireEvent.click(button(/Options/));
    fireEvent.click(button('Aperçu lecteur'));

    expect(handlers.onOpenAnalytics).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenHistory).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenSchedule).toHaveBeenCalledTimes(1);
    expect(handlers.onTogglePremium).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleSettings).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenReaderPreview).toHaveBeenCalledTimes(1);
    // Le lien public n'apparaît que si une URL existe.
    expect(screen.getByRole('link', { name: 'Aperçu' }).getAttribute('href')).toBe(
      '/preview/art-1'
    );
  });

  it('n’affiche ni historique ni lien public sans données', () => {
    renderHeader({ onOpenHistory: undefined, previewHref: undefined });
    expect(screen.queryByRole('button', { name: 'Historique de publication' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Aperçu' })).toBeNull();
  });

  it('nomme le bouton Premium selon l’état', () => {
    const { onTogglePremium } = renderHeader({ isPremium: true });

    fireEvent.click(button('Article Premium'));
    expect(onTogglePremium).toHaveBeenCalledTimes(1);
  });

  it('propose « Publier » sur un brouillon', () => {
    const { onPublish } = renderHeader();
    fireEvent.click(button(/Publier/));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('propose « Mettre à jour » sur un article publié modifié', () => {
    const { onUpdateLive } = renderHeader({
      published: true,
      hasUnsavedChanges: true,
      hasUnpublishedChanges: true,
    });

    fireEvent.click(button(/Mettre à jour/));
    expect(onUpdateLive).toHaveBeenCalledTimes(1);
  });

  it('affiche « Version en ligne » quand rien n’a changé', () => {
    renderHeader({ published: true });
    expect(button(/Version en ligne/)).toBeDefined();
  });

  it('remplace les actions de publication par « Soumettre » pour un rédacteur média', () => {
    const { onSubmitReview } = renderHeader({
      capabilities: { isMedia: true, canPublish: false } as never,
      published: false,
    });

    fireEvent.click(button(/Soumettre/));
    expect(onSubmitReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Publier/ })).toBeNull();
  });

  it('masque « Soumettre » quand l’article est déjà en relecture', () => {
    renderHeader({
      capabilities: { isMedia: true, canPublish: false } as never,
      status: 'SUBMITTED',
    });

    expect(screen.queryByRole('button', { name: /Soumettre/ })).toBeNull();
  });

  it('montre « Comparer » seulement pour un article publié modifié', () => {
    const { onOpenDiff } = renderHeader({
      published: true,
      hasUnpublishedChanges: true,
      onOpenDiff: vi.fn(),
    });

    fireEvent.click(button(/Comparer/));
    expect(onOpenDiff).toHaveBeenCalledTimes(1);
  });

  it('cache « Comparer » sans différence avec la version en ligne', () => {
    renderHeader({ published: true, hasUnpublishedChanges: false, hasUnsavedChanges: false });
    expect(screen.queryByRole('button', { name: /Comparer/ })).toBeNull();
  });

  it('décrit chaque état de co-édition', () => {
    renderHeader({ showCollaboration: true, collaborationStatus: 'connecting' });
    expect(screen.getByTestId('collaboration-status').textContent).toContain('Connexion…');

    cleanup();
    renderHeader({ showCollaboration: true, collaborationSynced: false });
    expect(screen.getByTestId('collaboration-status').textContent).toContain('Synchronisation…');

    cleanup();
    renderHeader({ showCollaboration: true, collaborationPeerCount: 2 });
    expect(screen.getByTestId('collaboration-status').textContent).toContain('3 éditeurs');

    cleanup();
    renderHeader({ showCollaboration: true });
    expect(screen.getByTestId('collaboration-status').textContent).toContain('Co-édition');
  });

  it('affiche les changements en attente et permet de reconnecter', () => {
    const { onRetryCollaboration } = renderHeader({
      showCollaboration: true,
      collaborationStatus: 'disconnected',
      collaborationConnected: false,
      collaborationSynced: false,
      collaborationUnsyncedChanges: 4,
      collaborationError: 'Réseau interrompu',
    });

    expect(screen.getByText('4 en attente')).toBeDefined();
    expect(screen.getByText('Connexion de co-édition interrompue.')).toBeDefined();
    expect(screen.getByText('Réseau interrompu')).toBeDefined();

    fireEvent.click(button('Reconnecter la co-édition'));
    expect(onRetryCollaboration).toHaveBeenCalledTimes(1);
  });

  it('explique une indisponibilité de la co-édition avec un repli générique', () => {
    renderHeader({ showCollaboration: true, collaborationStatus: 'error' });

    expect(screen.getByText('La co-édition est indisponible.')).toBeDefined();
    expect(
      screen.getByText(
        'Vos modifications restent dans le document local et seront fusionnées à la reconnexion.'
      )
    ).toBeDefined();
  });

  it('cache complètement la co-édition quand elle n’est pas proposée', () => {
    renderHeader({ showCollaboration: false, collaborationStatus: 'error' });

    expect(screen.queryByTestId('collaboration-status')).toBeNull();
    expect(screen.queryByText('La co-édition est indisponible.')).toBeNull();
  });
});
