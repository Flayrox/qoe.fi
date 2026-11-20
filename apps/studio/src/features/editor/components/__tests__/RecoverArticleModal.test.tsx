// =====================================================================
// 🧪 RecoverArticleModal — récupérer un texte écrit pour un média
// =====================================================================
// L'écran sert à sortir un auteur d'une collaboration terminée. On vérifie
// quelle version est choisie par défaut, ce qui est réellement envoyé au
// serveur, et les issues (import réussi, refus serveur, annulation).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const articleActions = vi.hoisted(() => ({
  getArticleSnapshotsAction: vi.fn(),
  forkArticleToPersonalAction: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));
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

import { RecoverArticleModal } from '../RecoverArticleModal';

const snapshots = [
  {
    id: 'snap-live',
    title: 'Version média',
    reason: 'PUBLISHED',
    wordCount: 900,
    createdAt: '2026-11-10T09:00:00.000Z',
    actorId: 'editor-media',
    actorName: 'Rédac',
    content: '<p>Texte retravaillé par le média.</p>',
  },
  {
    id: 'snap-mine',
    title: 'Ma version',
    reason: 'SUBMITTED',
    wordCount: 800,
    createdAt: '2026-11-08T09:00:00.000Z',
    actorId: 'author-1',
    actorName: 'Ada',
    content: '<p>Mon texte d’origine.</p>',
  },
];

function renderModal(props: Partial<React.ComponentProps<typeof RecoverArticleModal>> = {}) {
  const onClose = vi.fn();
  const rendered = render(
    <RecoverArticleModal
      open
      onClose={onClose}
      articleId="art-1"
      articleTitle="Essai sur la ville"
      publisherName="La Revue"
      currentUserId="author-1"
      currentLiveContent="<p>Texte retravaillé par le média.</p>"
      {...props}
    />
  );
  return { ...rendered, onClose };
}

describe('RecoverArticleModal', () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    // jsdom refuse la navigation : on la remplace par un objet inerte.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' },
    });
    articleActions.getArticleSnapshotsAction.mockResolvedValue({ ok: true, data: snapshots });
    articleActions.forkArticleToPersonalAction.mockResolvedValue({
      ok: true,
      data: { id: 'copy-1' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('débloque l’import quand l’action serveur lève une exception', async () => {
    articleActions.forkArticleToPersonalAction.mockRejectedValueOnce(new Error('Import refusé'));
    renderModal();
    await waitFor(() => expect(screen.getByText('Votre dernière version rédigée')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Importer dans mes brouillons/ }));

    // Sans capture de l'exception, le bouton restait sur « Importation… » et
    // l'auteur n'avait ni exemplaire ni explication.
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Import refusé'));
    const button = screen.getByRole('button', {
      name: /Importer dans mes brouillons/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('ne rend rien quand la modale est fermée', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Importer dans mon espace personnel')).toBeNull();
    expect(articleActions.getArticleSnapshotsAction).not.toHaveBeenCalled();
  });

  it('affiche le chargement puis les versions disponibles', async () => {
    renderModal();

    expect(screen.getByText('Recherche des versions disponibles…')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Votre dernière version rédigée')).toBeDefined());
    expect(articleActions.getArticleSnapshotsAction).toHaveBeenCalledWith({ articleId: 'art-1' });
    expect(screen.getByText(/800 mots/)).toBeDefined();
  });

  it('présélectionne la version rédigée par l’auteur courant', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Votre dernière version rédigée')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Importer dans mes brouillons/ }));

    await waitFor(() =>
      expect(articleActions.forkArticleToPersonalAction).toHaveBeenCalledWith({
        articleId: 'art-1',
        snapshotId: 'snap-mine',
      })
    );
  });

  it('n’envoie aucune version quand l’auteur n’a jamais rien rédigé', async () => {
    renderModal({ currentUserId: 'author-2' });
    await waitFor(() =>
      expect(screen.getByText('Dernière version publiée / collective')).toBeDefined()
    );
    expect(screen.queryByText('Votre dernière version rédigée')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Importer dans mes brouillons/ }));

    await waitFor(() =>
      expect(articleActions.forkArticleToPersonalAction).toHaveBeenCalledWith({
        articleId: 'art-1',
        snapshotId: undefined,
      })
    );
  });

  it('permet de choisir une version précise dans l’historique', async () => {
    renderModal({ currentUserId: 'author-2' });
    const historyToggle = await screen.findByText(/Choisir une version spécifique/);
    fireEvent.click(historyToggle);
    fireEvent.click(screen.getByText('Ma version'));
    fireEvent.click(screen.getByRole('button', { name: /Importer dans mes brouillons/ }));

    await waitFor(() =>
      expect(articleActions.forkArticleToPersonalAction).toHaveBeenCalledWith({
        articleId: 'art-1',
        snapshotId: 'snap-mine',
      })
    );
  });

  it('montre la version choisie et son diff dans l’aperçu', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Votre dernière version rédigée')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: /Aperçu du texte/ }));

    await waitFor(() =>
      expect(screen.getByText('Différences par rapport à la version en ligne :')).toBeDefined()
    );
    expect(screen.getByText(/Mon texte d’origine/)).toBeDefined();
  });

  it('signale un échec de chargement sans proposer d’import', async () => {
    articleActions.getArticleSnapshotsAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Historique indisponible' },
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('Historique indisponible')).toBeDefined());
    expect(screen.queryByText('Votre dernière version rédigée')).toBeNull();
  });

  it('importe puis redirige vers la copie personnelle', async () => {
    const { onClose } = renderModal();
    await waitFor(() => expect(screen.getByText('Votre dernière version rédigée')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Importer dans mes brouillons/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toastMock.success).toHaveBeenCalled();
    expect(window.location.href).toBe('/articles/copy-1');
  });

  it('garde la modale ouverte et affiche le refus du serveur', async () => {
    articleActions.forkArticleToPersonalAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Quota de brouillons atteint' },
    });
    const { onClose } = renderModal();
    await waitFor(() => expect(screen.getByText('Votre dernière version rédigée')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Importer dans mes brouillons/ }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Quota de brouillons atteint')
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });

  it('désactive l’import pendant l’envoi et permet d’annuler', async () => {
    let resolveFork: (value: unknown) => void = () => {};
    articleActions.forkArticleToPersonalAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFork = resolve;
      })
    );
    const { onClose } = renderModal();
    await waitFor(() => expect(screen.getByText('Votre dernière version rédigée')).toBeDefined());

    const submit = screen.getByRole('button', { name: /Importer dans mes brouillons/ });
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText('Importation…')).toBeDefined());
    expect((screen.getByRole('button', { name: /Annuler/ }) as HTMLButtonElement).disabled).toBe(
      true
    );

    await act(async () => {
      resolveFork({ ok: true, data: { id: 'copy-2' } });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
