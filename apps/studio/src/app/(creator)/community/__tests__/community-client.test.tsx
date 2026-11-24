// =====================================================================
// 🧪 L21f — modération des commentaires : courses de sélection
// =====================================================================
// `load(articleId)` n'a aucun garde de fraîcheur : passer de l'article A à
// B, puis laisser la réponse de A arriver en dernier, affiche les
// commentaires de A sous la sélection B.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@qoe/sdk/actions/articles', () => ({
  getArticleCommentsAction: vi.fn(),
  deleteArticleCommentAction: vi.fn(),
}));

import { getArticleCommentsAction } from '@qoe/sdk/actions/articles';

import { CommunityClient } from '../community-client';

const getComments = vi.mocked(getArticleCommentsAction);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const articleA = { id: 'a', title: 'Article A', commentsCount: 0 };
const articleB = { id: 'b', title: 'Article B', commentsCount: 0 };

function comment(id: string, content: string) {
  return { id, content, parentId: null, author: { name: 'Lecteur', username: 'lecteur' } };
}

describe('CommunityClient — sélection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignore la réponse d’un article qui n’est plus sélectionné', async () => {
    const first = deferred<never>();
    const second = deferred<never>();
    getComments.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    render(<CommunityClient articles={[articleA, articleB]} />);

    // Le montage charge A ; on bascule vite sur B.
    fireEvent.click(screen.getByText('Article B'));

    second.resolve({
      ok: true,
      data: { items: [comment('c-b', 'Commentaire de B')], nextCursor: '', hasMore: false },
    } as never);
    await screen.findByText('Commentaire de B');

    // La réponse tardive de A ne doit rien écraser.
    first.resolve({
      ok: true,
      data: { items: [comment('c-a', 'Commentaire de A')], nextCursor: '', hasMore: false },
    } as never);

    await waitFor(() => expect(screen.queryByText('Commentaire de A')).toBeNull());
    expect(screen.getByText('Commentaire de B')).toBeDefined();
  });
});
