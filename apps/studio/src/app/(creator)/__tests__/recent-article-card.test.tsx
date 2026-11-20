// =====================================================================
// 🧪 L21f — carte d'article récent : relâchement des états d'action
// =====================================================================
// `pending` pilote le spinner et `disabled` du déclencheur. Si l'action
// rejette (réseau, Go indisponible), l'état doit retomber : sinon le menu
// reste verrouillé et le créateur ne peut plus rien faire de la carte.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// L'image Next exige un loader ; la carte ne teste pas le rendu visuel.
vi.mock('next/image', () => ({
  default: () => <span data-slot="cover" />,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@qoe/sdk/actions/articles', () => ({
  bulkUpdateArticlesAction: vi.fn(),
  deleteArticleAction: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Le menu Radix ne s'ouvre pas en jsdom (portail + pointer events) : on rend
// les items comme de simples boutons, ce qui suffit à tester la décision.
vi.mock('@qoe/ui/ui/dropdown-menu', () => {
  const passthrough =
    (tag: string) =>
    ({ children }: { children?: React.ReactNode }) => <div data-slot={tag}>{children}</div>;

  return {
    DropdownMenu: passthrough('dropdown'),
    DropdownMenuTrigger: ({
      children,
      disabled,
      ...rest
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
    }) => (
      <button type="button" disabled={disabled} data-slot="trigger" {...rest}>
        {children}
      </button>
    ),
    DropdownMenuContent: passthrough('content'),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      onAction,
      isDisabled,
      href,
    }: {
      children?: React.ReactNode;
      onAction?: () => void;
      isDisabled?: boolean;
      href?: string;
    }) => (
      <button type="button" onClick={onAction} disabled={isDisabled} data-href={href}>
        {children}
      </button>
    ),
  };
});

vi.mock('@qoe/ui/ui/UserAvatar', () => ({
  UserAvatar: () => <span data-slot="avatar" />,
}));

import { bulkUpdateArticlesAction, deleteArticleAction } from '@qoe/sdk/actions/articles';
import { RecentArticleTile, type RecentArticleTileData } from '../recent-article-card';

const bulkUpdate = vi.mocked(bulkUpdateArticlesAction);
const removeArticle = vi.mocked(deleteArticleAction);

const ARTICLE: RecentArticleTileData = {
  id: 'art_1',
  title: 'Une nuit à Lisbonne',
  published: true,
  categoryName: 'Voyage',
};

describe('RecentArticleTile — états d’action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('relâche le déclencheur quand la publication rejette', async () => {
    bulkUpdate.mockRejectedValue(new Error('Go indisponible'));

    render(<RecentArticleTile article={ARTICLE} updatedLabel="il y a 2 h" />);

    fireEvent.click(screen.getByText('Dépublier'));

    await waitFor(() => expect(screen.getByLabelText("Actions de l'article")).not.toBeDisabled());
  });

  it('relâche le déclencheur quand la suppression rejette', async () => {
    removeArticle.mockRejectedValue(new Error('Go indisponible'));

    render(<RecentArticleTile article={ARTICLE} updatedLabel="il y a 2 h" />);

    fireEvent.click(screen.getByText('Supprimer'));

    await waitFor(() => expect(screen.getByLabelText("Actions de l'article")).not.toBeDisabled());
  });
});
