// =====================================================================
// 🧪 ArticleBulkTransferDialog — transférer des articles vers une publication
// =====================================================================
// Le transfert déplace des articles entre un profil personnel et des médias :
// on ne doit proposer que les destinations qui peuvent réellement les
// accueillir, progresser article par article, et ne jamais annoncer un succès
// quand un envoi a échoué.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const articleActions = vi.hoisted(() => ({
  getWorkspacesAction: vi.fn(),
  transferArticleAction: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));

import { ArticleBulkTransferDialog } from '../article-bulk-transfer-dialog';

const personal = {
  id: 'ws-personal',
  name: 'Ada',
  slug: 'ada',
  logoUrl: null,
  type: 'PERSONAL' as const,
};

const media = (id: string, name: string, role?: string) => ({
  id,
  name,
  slug: id,
  logoUrl: null,
  type: 'MEDIA' as const,
  role,
});

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ArticleBulkTransferDialog>> = {}
) {
  const onOpenChange = vi.fn();
  const onApplied = vi.fn().mockResolvedValue(undefined);
  const rendered = render(
    <ArticleBulkTransferDialog
      open
      onOpenChange={onOpenChange}
      selectedIds={['art-1', 'art-2']}
      selectedCount={2}
      onApplied={onApplied}
      {...overrides}
    />
  );
  return { ...rendered, onOpenChange, onApplied };
}

describe('ArticleBulkTransferDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleActions.getWorkspacesAction.mockResolvedValue({
      ok: true,
      data: {
        personal,
        medias: [
          media('media-editor', 'La Revue', 'editor'),
          media('media-owner', 'Le Quotidien', 'owner'),
          media('media-reader', 'Observatoire', 'reader'),
          media('media-no-role', 'Sans rôle'),
        ],
      },
    });
    articleActions.transferArticleAction.mockResolvedValue({ ok: true, data: { id: 'x' } });
  });

  afterEach(() => {
    cleanup();
  });

  it('ne charge rien quand il est fermé', () => {
    renderDialog({ open: false });
    expect(articleActions.getWorkspacesAction).not.toHaveBeenCalled();
  });

  it('affiche le chargement puis les destinations autorisées', async () => {
    renderDialog();

    expect(screen.getByText('Chargement des publications…')).toBeDefined();

    await waitFor(() => expect(screen.getByText('Le Quotidien')).toBeDefined());
    expect(
      screen.getByText('Transferer 2 article(s)'.replace('Transferer', 'Transférer'))
    ).toBeDefined();
    expect(screen.getByText('Ada')).toBeDefined();
    expect(screen.getByText('La Revue')).toBeDefined();
    // Un média où l'utilisateur ne peut pas écrire n'est pas une destination.
    expect(screen.queryByText('Observatoire')).toBeNull();
    expect(screen.queryByText('Sans rôle')).toBeNull();
  });

  it('garde le profil personnel quand aucun média ne peut recevoir les articles', async () => {
    articleActions.getWorkspacesAction.mockResolvedValueOnce({
      ok: true,
      data: { personal, medias: [media('media-reader', 'Observatoire', 'reader')] },
    });
    renderDialog();

    await waitFor(() => expect(screen.getByText('Ada')).toBeDefined());
    expect(screen.queryByText('Observatoire')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ada/ }));
    expect(screen.getByRole('button', { name: 'Transférer vers Ada' })).toBeDefined();
  });

  it('affiche un message d’erreur si le chargement échoue', async () => {
    articleActions.getWorkspacesAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Service indisponible' },
    });
    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByText('Impossible de charger vos publications. Réessayez dans un instant.')
      ).toBeDefined()
    );
    expect((screen.getByRole('button', { name: 'Transférer' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('traite aussi un rejet réseau du chargement', async () => {
    articleActions.getWorkspacesAction.mockRejectedValueOnce(new Error('hors ligne'));
    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByText('Impossible de charger vos publications. Réessayez dans un instant.')
      ).toBeDefined()
    );
  });

  it('garde le bouton inactif tant qu’aucune destination n’est choisie', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    expect((screen.getByRole('button', { name: 'Transférer' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('nomme l’action avec la destination choisie', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));

    expect(screen.getByRole('button', { name: 'Transférer vers La Revue' })).toBeDefined();
  });

  it('transfère chaque article vers la publication choisie', async () => {
    const { onOpenChange, onApplied } = renderDialog();
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers La Revue' }));

    await waitFor(() => expect(articleActions.transferArticleAction).toHaveBeenCalledTimes(2));
    expect(articleActions.transferArticleAction).toHaveBeenNthCalledWith(1, {
      articleId: 'art-1',
      targetPublisherId: 'media-editor',
    });
    expect(articleActions.transferArticleAction).toHaveBeenNthCalledWith(2, {
      articleId: 'art-2',
      targetPublisherId: 'media-editor',
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('2 articles transférés.'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('utilise le singulier pour un seul article', async () => {
    articleActions.transferArticleAction.mockResolvedValue({ ok: true, data: { id: 'x' } });
    renderDialog({ selectedIds: ['art-1'], selectedCount: 1 });
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers La Revue' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('1 article transféré.'));
  });

  it('rapporte chaque échec, réponse vide comme exception', async () => {
    articleActions.transferArticleAction
      .mockResolvedValueOnce({ ok: true, data: { id: 'art-1' } })
      .mockResolvedValueOnce({ ok: false, error: { message: 'Droits insuffisants' } })
      .mockRejectedValueOnce(new Error('réseau'));
    renderDialog({ selectedIds: ['art-1', 'art-2', 'art-3'], selectedCount: 3 });
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers La Revue' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('1 article transféré.'));
    expect(toastMock.error).toHaveBeenCalledWith("2 articles n'ont pas pu être transférés.");
  });

  it('n’annonce aucun succès quand tous les transferts échouent', async () => {
    articleActions.transferArticleAction.mockResolvedValue({
      ok: false,
      error: { message: 'Refusé' },
    });
    renderDialog();
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers La Revue' }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("2 articles n'ont pas pu être transférés.")
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('bloque la fermeture et les clics pendant le transfert', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    articleActions.transferArticleAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const { onOpenChange } = renderDialog({ selectedIds: ['art-1'], selectedCount: 1 });
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers La Revue' }));

    await waitFor(() => expect(screen.getByText(/Transfert en cours…/)).toBeDefined());
    expect((screen.getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveFirst({ ok: true, data: { id: 'art-1' } });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('affiche la progression article par article', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    let resolveSecond: (value: unknown) => void = () => {};
    articleActions.transferArticleAction
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );
    renderDialog();
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers La Revue' }));

    // Le compteur est découpé en nœuds de texte (« 0 », « / », « 2 ») : on lit
    // la ligne entière depuis le document.
    const progress = () =>
      /Transfert en cours… (\d+\/\d+)/.exec(document.body.textContent ?? '')?.[1] ?? null;

    await waitFor(() => expect(progress()).toBe('0/2'));

    resolveFirst({ ok: true, data: { id: 'art-1' } });
    await waitFor(() => expect(progress()).toBe('1/2'));

    resolveSecond({ ok: true, data: { id: 'art-2' } });
    await waitFor(() => expect(progress()).toBeNull());
  });

  it('ne transforme pas un rafraîchissement raté en échec de transfert', async () => {
    const onApplied = vi.fn().mockRejectedValue(new Error('refresh KO'));
    renderDialog({ onApplied });
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers La Revue' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Les transferts sont terminés, mais la liste n'a pas pu être rafraîchie."
      )
    );
    expect(toastMock.success).toHaveBeenCalledWith('2 articles transférés.');
  });

  it('recharge la liste et oublie la destination à la réouverture', async () => {
    const { rerender } = renderDialog();
    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));
    expect(screen.getByRole('button', { name: 'Transférer vers La Revue' })).toBeDefined();

    rerender(
      <ArticleBulkTransferDialog
        open={false}
        onOpenChange={vi.fn()}
        selectedIds={['art-1', 'art-2']}
        selectedCount={2}
        onApplied={vi.fn()}
      />
    );
    rerender(
      <ArticleBulkTransferDialog
        open
        onOpenChange={vi.fn()}
        selectedIds={['art-1', 'art-2']}
        selectedCount={2}
        onApplied={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());
    expect(articleActions.getWorkspacesAction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDefined();
  });
});
