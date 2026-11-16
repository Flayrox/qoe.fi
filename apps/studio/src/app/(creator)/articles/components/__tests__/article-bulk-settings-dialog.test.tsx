// =====================================================================
// 🧪 ArticleBulkSettingsDialog — modifications groupées d'articles
// =====================================================================
// L'outil touche plusieurs articles d'un coup : le risque n'est pas
// l'affichage mais le payload envoyé. On vérifie le mappage tri-état →
// booléens, la garde « aucun changement », la confirmation avant publication
// et le traitement des échecs partiels.
// =====================================================================

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const articleActions = vi.hoisted(() => ({
  bulkUpdateArticlesAction: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));

/** Le sélecteur react-aria (listbox portail) n'apporte rien ici : on veut le
 *  contrat `value` → `onValueChange`, pas la mécanique du popover. */
vi.mock('@qoe/ui/select', async () => {
  const react = await import('react');
  return {
    Select: ({
      label,
      value,
      options,
      onValueChange,
    }: {
      label: string;
      value?: string;
      options: { id: string; label: string }[];
      onValueChange?: (value: string) => void;
    }) =>
      react.createElement(
        'select',
        {
          'aria-label': label,
          value: value ?? '',
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            onValueChange?.(event.target.value),
        },
        options.map((option) =>
          react.createElement('option', { key: option.id, value: option.id }, option.label)
        )
      ),
  };
});

import { ArticleBulkSettingsDialog } from '../article-bulk-settings-dialog';

const categories = [
  {
    id: 'cat-root',
    name: 'Essais',
    slug: 'essais',
    description: null,
    parentId: null,
    _count: { articles: 4 },
  },
  {
    id: 'cat-child',
    name: '  Critique  ',
    slug: 'critique',
    description: null,
    parentId: 'cat-root',
    _count: { articles: 2 },
  },
  {
    id: 'cat-orphan',
    name: '',
    slug: 'orpheline',
    description: null,
    parentId: null,
    _count: { articles: 0 },
  },
];

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ArticleBulkSettingsDialog>> = {}
) {
  const onOpenChange = vi.fn();
  const onApplied = vi.fn().mockResolvedValue(undefined);
  const onRequestConfirm = vi.fn();
  const rendered = render(
    <ArticleBulkSettingsDialog
      open
      onOpenChange={onOpenChange}
      selectedIds={['art-1', 'art-2', 'art-3']}
      selectedCount={3}
      categories={categories}
      onApplied={onApplied}
      onRequestConfirm={onRequestConfirm}
      {...overrides}
    />
  );
  return { ...rendered, onOpenChange, onApplied, onRequestConfirm };
}

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

function choose(label: string, value: string) {
  fireEvent.change(select(label), { target: { value } });
}

describe('ArticleBulkSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleActions.bulkUpdateArticlesAction.mockResolvedValue({
      ok: true,
      data: { updated: 3, failed: [] },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('ne rend rien quand il est fermé', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('button', { name: 'Appliquer' })).toBeNull();
  });

  it('annonce le nombre d’articles concernés et n’applique rien par défaut', async () => {
    const { onOpenChange } = renderDialog();

    expect(screen.getByText('Modifier 3 article(s)')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Choisissez au moins un paramètre à modifier.')
    );
    expect(articleActions.bulkUpdateArticlesAction).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('liste les catégories hiérarchisées avec un repli sur le slug', () => {
    renderDialog();

    const values = Array.from(select('Catégorie').options).map((option) => ({
      value: option.value,
      label: option.textContent,
    }));

    expect(values).toEqual([
      { value: 'keep', label: 'Ne pas modifier' },
      { value: 'default', label: 'Non catégorisé' },
      { value: 'cat-root', label: 'Essais' },
      { value: 'cat-child', label: '↳ Critique' },
      { value: 'cat-orphan', label: 'orpheline' },
    ]);
  });

  it('mappe la catégorie choisie en changement explicite', async () => {
    const { onOpenChange, onApplied } = renderDialog();
    choose('Catégorie', 'cat-child');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() =>
      expect(articleActions.bulkUpdateArticlesAction).toHaveBeenCalledWith({
        ids: ['art-1', 'art-2', 'art-3'],
        setCategory: true,
        categoryId: 'cat-child',
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith('3 articles mis à jour.');
  });

  it('traduit « Non catégorisé » par une catégorie nulle', async () => {
    renderDialog();
    choose('Catégorie', 'default');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() =>
      expect(articleActions.bulkUpdateArticlesAction).toHaveBeenCalledWith({
        ids: ['art-1', 'art-2', 'art-3'],
        setCategory: true,
        categoryId: null,
      })
    );
  });

  it('compose un payload complet quand plusieurs paramètres changent', async () => {
    renderDialog();

    choose('Article Premium', 'on');
    choose('Commentaires', 'off');
    choose('Annotations publiques', 'on');
    choose('Téléchargement hors-ligne', 'off');
    choose('Profil personnel', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() =>
      expect(articleActions.bulkUpdateArticlesAction).toHaveBeenCalledWith({
        ids: ['art-1', 'art-2', 'art-3'],
        isPremium: true,
        allowComments: false,
        allowPublicAnnotations: true,
        allowDownload: false,
        showOnPersonalProfile: true,
      })
    );
  });

  it('accepte un payload entièrement à « Désactiver »', async () => {
    renderDialog();
    choose('Commentaires', 'off');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() =>
      expect(articleActions.bulkUpdateArticlesAction).toHaveBeenCalledWith({
        ids: ['art-1', 'art-2', 'art-3'],
        allowComments: false,
      })
    );
  });

  it('utilise le singulier quand un seul article est modifié', async () => {
    articleActions.bulkUpdateArticlesAction.mockResolvedValueOnce({
      ok: true,
      data: { updated: 1, failed: [] },
    });
    renderDialog();
    choose('Article Premium', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('1 article mis à jour.'));
  });

  it('signale les articles refusés sans masquer les réussites', async () => {
    articleActions.bulkUpdateArticlesAction.mockResolvedValueOnce({
      ok: true,
      data: { updated: 2, failed: ['art-3', 'art-4'] },
    });
    const { onOpenChange } = renderDialog();
    choose('Commentaires', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('2 articles mis à jour.'));
    expect(toastMock.error).toHaveBeenCalledWith("2 articles n'ont pas pu être modifiés.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('garde le dialogue ouvert et affiche le motif serveur en cas d’échec global', async () => {
    articleActions.bulkUpdateArticlesAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Quota de publication atteint' },
    });
    const { onOpenChange, onApplied } = renderDialog();
    choose('Article Premium', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Quota de publication atteint')
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('rapporte une panne réseau et laisse réessayer', async () => {
    articleActions.bulkUpdateArticlesAction.mockRejectedValueOnce(new Error('Réseau coupé'));
    const { onOpenChange } = renderDialog();
    choose('Article Premium', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Réseau coupé'));
    expect(onOpenChange).not.toHaveBeenCalled();
    // Le bouton doit redevenir actionnable une fois l'appel terminé.
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Appliquer' }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
  });

  it('ne présente pas un rafraîchissement raté comme un échec de la modification', async () => {
    // Les articles SONT modifiés : un rafraîchissement de liste qui casse ne
    // doit pas afficher « Échec de la modification groupée ».
    const onApplied = vi.fn().mockRejectedValue(new Error('refresh KO'));
    renderDialog({ onApplied });
    choose('Article Premium', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Les articles ont été modifiés, mais la liste n'a pas pu être rafraîchie."
      )
    );
    expect(toastMock.error).not.toHaveBeenCalledWith('refresh KO');
    expect(toastMock.success).toHaveBeenCalledWith('3 articles mis à jour.');
  });

  it('bloque tout pendant l’application et ignore une fermeture', async () => {
    let resolveUpdate: (value: unknown) => void = () => {};
    articleActions.bulkUpdateArticlesAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
    );
    const { onOpenChange } = renderDialog();
    choose('Article Premium', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(
        true
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveUpdate({ ok: true, data: { updated: 3, failed: [] } });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('ne lance rien sur une sélection vide', async () => {
    renderDialog({ selectedIds: [], selectedCount: 0 });
    choose('Article Premium', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(toastMock.success).not.toHaveBeenCalled());
    expect(articleActions.bulkUpdateArticlesAction).not.toHaveBeenCalled();
  });

  it('demande confirmation avant de publier, sans toucher au serveur', () => {
    const { onRequestConfirm } = renderDialog();
    choose('Publisher', 'publish');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(onRequestConfirm).toHaveBeenCalledTimes(1);
    const action = onRequestConfirm.mock.calls[0][0];
    expect(action.title).toBe('Publier 3 article(s) ?');
    expect(action.confirmLabel).toBe('Publier');
    expect(action.destructive).toBe(false);
    expect(articleActions.bulkUpdateArticlesAction).not.toHaveBeenCalled();
  });

  it('décrit la publication comme immédiate et définitive', () => {
    const { onRequestConfirm } = renderDialog();
    choose('Publisher', 'publish');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(onRequestConfirm.mock.calls[0][0].description).toBe(
      'Les articles sélectionnés seront immédiatement visibles publiquement.'
    );
  });

  it('marque la dépublication comme destructive', () => {
    const { onRequestConfirm } = renderDialog();
    choose('Publisher', 'unpublish');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    const action = onRequestConfirm.mock.calls[0][0];
    expect(action.title).toBe('Dépublier 3 article(s) ?');
    expect(action.confirmLabel).toBe('Dépublier');
    expect(action.destructive).toBe(true);
  });

  it('applique la publication une fois la confirmation acceptée', async () => {
    const { onRequestConfirm } = renderDialog();
    choose('Publisher', 'publish');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await onRequestConfirm.mock.calls[0][0].onConfirm();

    expect(articleActions.bulkUpdateArticlesAction).toHaveBeenCalledWith({
      ids: ['art-1', 'art-2', 'art-3'],
      published: true,
    });
  });

  it('affiche un avertissement contextuel pour chaque choix de publication', () => {
    renderDialog();
    expect(screen.queryByText(/immédiatement visibles publiquement/)).toBeNull();

    choose('Publisher', 'publish');
    expect(
      screen.getByText('Les articles seront immédiatement visibles publiquement.')
    ).toBeDefined();

    choose('Publisher', 'unpublish');
    expect(
      screen.getByText('Les articles seront immédiatement retirés du site public.')
    ).toBeDefined();
  });

  it('repart d’un brouillon vierge à la réouverture', () => {
    const { rerender } = render(
      <ArticleBulkSettingsDialog
        open
        onOpenChange={vi.fn()}
        selectedIds={['art-1']}
        selectedCount={1}
        categories={categories}
        onApplied={vi.fn()}
        onRequestConfirm={vi.fn()}
      />
    );
    choose('Article Premium', 'on');

    rerender(
      <ArticleBulkSettingsDialog
        open={false}
        onOpenChange={vi.fn()}
        selectedIds={['art-1']}
        selectedCount={1}
        categories={categories}
        onApplied={vi.fn()}
        onRequestConfirm={vi.fn()}
      />
    );
    rerender(
      <ArticleBulkSettingsDialog
        open
        onOpenChange={vi.fn()}
        selectedIds={['art-1']}
        selectedCount={1}
        categories={categories}
        onApplied={vi.fn()}
        onRequestConfirm={vi.fn()}
      />
    );

    expect(select('Article Premium').value).toBe('keep');
  });
});
