// =====================================================================
// 🧪 ArticleDiffModal — comparaison brouillon / version en ligne
// =====================================================================
// Cet écran décide si une modification part en ligne ou retourne en
// relecture. On vérifie les statistiques affichées, les gardes de rôle
// (`canReview`, statut `SUBMITTED`), le commentaire de retouches et les
// retours arrière (abandon confirmé ou non).
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
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

import { ArticleDiffModal } from '../ArticleDiffModal';

const liveContent = '<p>Le texte publié parle de la ville.</p>';
const draftContent = '<p>Le texte révisé parle de la ville et de ses habitants.</p>';

function renderModal(props: Partial<React.ComponentProps<typeof ArticleDiffModal>> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onApprove: vi.fn().mockResolvedValue(undefined),
    onReject: vi.fn().mockResolvedValue(undefined),
    onDiscardDraft: vi.fn().mockResolvedValue(undefined),
    onEdit: vi.fn(),
  };
  const rendered = render(
    <ArticleDiffModal
      open
      articleTitle="Titre en ligne"
      liveContent={liveContent}
      draftContent={draftContent}
      isPublished
      {...handlers}
      {...props}
    />
  );
  return { ...rendered, ...handlers };
}

describe('ArticleDiffModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('ne rend rien quand la modale est fermée', () => {
    render(
      <ArticleDiffModal
        open={false}
        onClose={vi.fn()}
        articleTitle="Titre"
        liveContent=""
        draftContent=""
        isPublished={false}
      />
    );
    expect(screen.queryByText('Comparaison des versions')).toBeNull();
  });

  it('résume les ajouts et suppressions en mots', () => {
    renderModal();

    // Le résumé compte les mots réellement ajoutés et retirés.
    expect(screen.getByText(/^\d+ ajouts, \d+ suppressions/)).toBeDefined();
    expect(screen.getByText(/\+\d+ mots ajoutés/)).toBeDefined();
  });

  it('annonce l’absence de différence textuelle', () => {
    renderModal({ draftContent: liveContent });
    expect(screen.getByText('Aucune différence textuelle détectée.')).toBeDefined();
  });

  it('affiche le changement de titre quand le brouillon en propose un autre', () => {
    renderModal({ draftTitle: 'Titre révisé' });

    expect(screen.getByText('Titre :')).toBeDefined();
    expect(screen.getByText('Titre en ligne')).toBeDefined();
    expect(screen.getByText('Titre révisé')).toBeDefined();
  });

  it('bascule entre côte à côte et vue unifiée', () => {
    renderModal();

    expect(screen.getByText('Version publiée (en ligne)')).toBeDefined();
    expect(screen.getByText('Brouillon proposé')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: /Vue unifiée/ }));

    expect(screen.queryByText('Version publiée (en ligne)')).toBeNull();
    expect(screen.queryByText('Brouillon proposé')).toBeNull();
  });

  it('cache les actions de relecture sans le rôle', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: /Approuver et publier/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Demander des retouches/ })).toBeNull();
  });

  it('approuve puis ferme la modale', async () => {
    const { onApprove, onClose } = renderModal({ canReview: true, status: 'SUBMITTED' });

    fireEvent.click(screen.getByRole('button', { name: /Approuver et publier/ }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('demande des retouches avec un commentaire nettoyé', async () => {
    const { onReject, onClose } = renderModal({ canReview: true, status: 'SUBMITTED' });

    fireEvent.click(screen.getByRole('button', { name: /Demander des retouches/ }));
    const textarea = screen.getByPlaceholderText(/Indiquez à l'auteur/);
    fireEvent.change(textarea, { target: { value: '   Préciser la source.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la demande de retouches/ }));

    await waitFor(() => expect(onReject).toHaveBeenCalledWith('Préciser la source.'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('permet d’annuler la demande de retouches sans rien envoyer', () => {
    const { onReject } = renderModal({ canReview: true, status: 'SUBMITTED' });

    fireEvent.click(screen.getByRole('button', { name: /Demander des retouches/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByPlaceholderText(/Indiquez à l'auteur/)).toBeNull();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('propose « Demander des retouches » uniquement pour un article soumis', () => {
    renderModal({ canReview: true, status: 'PUBLISHED' });
    expect(screen.queryByRole('button', { name: /Demander des retouches/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Approuver et publier/ })).toBeDefined();
  });

  it('n’abandonne le brouillon qu’après confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const { onDiscardDraft, onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Abandonner le brouillon/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onDiscardDraft).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /Abandonner le brouillon/ }));
    await waitFor(() => expect(onDiscardDraft).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ferme puis ouvre l’éditeur quand on demande à modifier', () => {
    const { onClose, onEdit } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Modifier dans l'éditeur/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('garde la modale ouverte et signale l’échec d’approbation', async () => {
    const onApprove = vi.fn().mockRejectedValue(new Error('Serveur indisponible'));
    const onClose = vi.fn();
    render(
      <ArticleDiffModal
        open
        onClose={onClose}
        articleTitle="Titre en ligne"
        liveContent={liveContent}
        draftContent={draftContent}
        isPublished
        canReview
        status="SUBMITTED"
        onApprove={onApprove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Approuver et publier/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Serveur indisponible'));
    expect(onClose).not.toHaveBeenCalled();
    // Le bouton redevient actif : l'auteur peut réessayer.
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /Approuver et publier/ }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
  });
});
