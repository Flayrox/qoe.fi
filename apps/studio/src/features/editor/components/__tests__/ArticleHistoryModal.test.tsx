// =====================================================================
// 🧪 ArticleHistoryModal — versions restaurées et chronologie
// =====================================================================
// L'historique est le seul moyen de revenir sur une version écrasée. On
// vérifie le chargement, la restauration (succès et échec) et le journal
// d'activité, y compris quand l'API est partiellement indisponible.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const articleActions = vi.hoisted(() => ({
  getArticleEventsAction: vi.fn(),
  getArticleSnapshotsAction: vi.fn(),
  restoreArticleSnapshotAction: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));

import { ArticleHistoryModal } from '../ArticleHistoryModal';

const snapshots = [
  {
    id: 'snap-1',
    title: 'Titre courant',
    reason: 'PUBLISHED',
    wordCount: 412,
    createdAt: '2026-11-15T09:00:00.000Z',
    actorName: 'Ada',
  },
  {
    id: 'snap-2',
    title: '',
    reason: 'INITIAL',
    wordCount: 12,
    createdAt: '2026-11-01T08:00:00.000Z',
    actorName: null,
  },
];

const events = [
  {
    id: 'ev-1',
    type: 'PUBLISHED',
    createdAt: '2026-11-15T09:00:00.000Z',
    fromStatus: 'DRAFT',
    toStatus: 'PUBLISHED',
    actorName: 'Ada',
    actorUsername: 'ada',
    scheduledAt: null,
  },
  {
    id: 'ev-2',
    type: 'SCHEDULED_PUBLISHED',
    createdAt: '2026-11-16T09:00:00.000Z',
    fromStatus: null,
    toStatus: null,
    actorName: null,
    actorId: null,
    scheduledAt: '2026-11-16T09:00:00.000Z',
  },
];

function renderModal(props: Partial<React.ComponentProps<typeof ArticleHistoryModal>> = {}) {
  const onClose = vi.fn();
  const onRestored = vi.fn();
  const rendered = render(
    <ArticleHistoryModal
      open
      articleId="art-1"
      onClose={onClose}
      onRestored={onRestored}
      {...props}
    />
  );
  return { ...rendered, onClose, onRestored };
}

describe('ArticleHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleActions.getArticleEventsAction.mockResolvedValue({ ok: true, data: events });
    articleActions.getArticleSnapshotsAction.mockResolvedValue({ ok: true, data: snapshots });
    articleActions.restoreArticleSnapshotAction.mockResolvedValue({ ok: true });
  });

  it('ne rend rien quand la modale est fermée', () => {
    render(<ArticleHistoryModal open={false} articleId="art-1" onClose={vi.fn()} />);
    expect(screen.queryByText("Historique de l'écrit")).toBeNull();
    expect(articleActions.getArticleSnapshotsAction).not.toHaveBeenCalled();
  });

  it('explique l’historique vide tant que l’article n’est pas enregistré', () => {
    render(<ArticleHistoryModal open articleId={null} onClose={vi.fn()} />);

    expect(
      screen.getByText("L'historique apparaîtra une fois l'article enregistré une première fois.")
    ).toBeDefined();
    expect(articleActions.getArticleSnapshotsAction).not.toHaveBeenCalled();
  });

  it('liste les versions avec libellé de raison, mots et auteur', async () => {
    renderModal();

    await waitFor(() => expect(screen.getByText('Titre courant')).toBeDefined());
    expect(articleActions.getArticleSnapshotsAction).toHaveBeenCalledWith({ articleId: 'art-1' });
    expect(screen.getByText('Publié')).toBeDefined();
    // Un titre vide n'affiche pas « null » mais un repli lisible.
    expect(screen.getByText('Sans titre')).toBeDefined();
    expect(screen.getByText('Création initiale')).toBeDefined();
    expect(screen.getByText('412 mots')).toBeDefined();
    expect(screen.getByText('Plus récent')).toBeDefined();
    expect(screen.getByText('Ada')).toBeDefined();
  });

  it('restaure une version puis ferme la modale et rafraîchit l’éditeur', async () => {
    const { onClose, onRestored } = renderModal();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Restaurer/ })).toHaveLength(2)
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Restaurer/ })[1]);

    await waitFor(() =>
      expect(articleActions.restoreArticleSnapshotAction).toHaveBeenCalledWith({
        articleId: 'art-1',
        snapshotId: 'snap-2',
      })
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('un échec de restauration garde la modale ouverte et affiche le motif', async () => {
    articleActions.restoreArticleSnapshotAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Version verrouillée' },
    });
    const { onClose, onRestored } = renderModal();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Restaurer/ })).toHaveLength(2)
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Restaurer/ })[0]);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Version verrouillée'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('masque la restauration quand l’utilisateur ne peut pas éditer', async () => {
    renderModal({ canEdit: false });

    await waitFor(() => expect(screen.getByText('Titre courant')).toBeDefined());
    expect(screen.queryByRole('button', { name: /Restaurer/ })).toBeNull();
  });

  it('affiche une erreur quand API événements et versions échouent toutes les deux', async () => {
    articleActions.getArticleEventsAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Service indisponible' },
    });
    articleActions.getArticleSnapshotsAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Service indisponible' },
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('Service indisponible')).toBeDefined());
  });

  it('signale l’échec partiel des versions et laisse le journal accessible', async () => {
    articleActions.getArticleSnapshotsAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Versions indisponibles' },
    });
    renderModal();

    // L'onglet des versions ne doit pas rester muet devant un échec serveur.
    await waitFor(() => expect(screen.getByText('Versions indisponibles')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: /Journal d'activité/ }));
    await waitFor(() => expect(screen.getByText('Publié automatiquement')).toBeDefined());
  });

  it('affiche le journal d’activité avec l’auteur et les événements automatiques', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Titre courant')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: /Journal d'activité/ }));

    await waitFor(() => expect(screen.getByText('Publié')).toBeDefined());
    expect(screen.getByText('Publié automatiquement')).toBeDefined();
    expect(screen.getByText('@ada')).toBeDefined();
    // Un événement sans acteur est présenté comme automatique.
    expect(screen.getByText('automatique')).toBeDefined();
    // La transition de statut est lisible telle quelle.
    expect(screen.getByText('DRAFT → PUBLISHED')).toBeDefined();
  });

  it('annonce l’absence de versions ou d’événements', async () => {
    articleActions.getArticleSnapshotsAction.mockResolvedValue({ ok: true, data: [] });
    articleActions.getArticleEventsAction.mockResolvedValue({ ok: true, data: [] });
    renderModal();

    await waitFor(() =>
      expect(screen.getByText("Aucune version textuelle enregistrée pour l'instant.")).toBeDefined()
    );

    fireEvent.click(screen.getByRole('tab', { name: /Journal d'activité/ }));
    await waitFor(() => expect(screen.getByText("Aucun événement pour l'instant.")).toBeDefined());
  });
});
