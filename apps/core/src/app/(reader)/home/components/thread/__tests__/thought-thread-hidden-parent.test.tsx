// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mapGoThreadToWebThread } from '@qoe/sdk/actions/feed/mappers';
import type { OptimisticThought } from '../ThoughtThreadContext';
import { ThoughtThreadRoot } from '../ThoughtThreadRoot';
import { ThoughtThreadParentContext } from '../ThoughtThreadParentContext';

const SECRET_CONTENT = 'Contenu secret du parent';
const SECRET_HANDLE = 'parent-bloque';

function makeThread(reason: 'blocked' | 'deleted') {
  return {
    id: 'reply-1',
    content: 'La réponse visible',
    authorId: 'author-2',
    createdAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    imageUrl: null,
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
    parentId: 'parent-1',
    rootId: 'parent-1',
    repostId: null,
    replyRestriction: 'everyone',
    isPinned: false,
    isHiddenByAuthor: false,
    parentUnavailable: true,
    parentUnavailableReason: reason,
    // Payload adversarial : le parent est présent ET marqué indisponible.
    // Le mapper doit conserver le flag et couper le parent.
    parent: {
      id: 'parent-1',
      content: SECRET_CONTENT,
      authorId: 'blocked-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      imageUrl: null,
      likeCount: 0,
      repostCount: 0,
      replyCount: 0,
      parentId: null,
      rootId: null,
      repostId: null,
      replyRestriction: 'everyone',
      isPinned: false,
      isHiddenByAuthor: false,
      author: {
        id: 'blocked-1',
        name: 'Compte bloqué',
        username: SECRET_HANDLE,
        logoUrl: null,
        isCertified: false,
      },
      parent: null,
      repost: null,
      attachments: [],
      poll: null,
      likes: [],
      reposts: [],
      _count: { likes: 0, replies: 0, reposts: 0 },
      liked: false,
      reposted: false,
    },
    author: {
      id: 'author-2',
      name: 'Répondeur',
      username: 'repondeur',
      subdomain: null,
      logoUrl: null,
      isCertified: false,
    },
    attachments: [],
    poll: null,
    likes: [],
    reposts: [],
    _count: { likes: 0, replies: 0, reposts: 0 },
    liked: false,
    reposted: false,
    replies: [],
  };
}

function renderThreadParent(reason: 'blocked' | 'deleted') {
  const post = mapGoThreadToWebThread(makeThread(reason) as never);
  expect(post).not.toBeNull();

  return render(
    <ThoughtThreadRoot
      postId={post!.id}
      currentUserId="viewer-1"
      dbUser={null}
      initialPost={post as unknown as OptimisticThought}
      standalone
    >
      <ThoughtThreadParentContext />
    </ThoughtThreadRoot>
  );
}

afterEach(() => {
  cleanup();
});

describe('ThoughtThreadParentContext — réponse à un parent masqué', () => {
  it.each([
    {
      reason: 'blocked' as const,
      label: 'Réponse à un compte bloqué',
      explanation: /Le contenu de ce compte reste masqué/,
    },
    {
      reason: 'deleted' as const,
      label: 'Réponse à un contenu indisponible',
      explanation: /Le contenu d'origine a été supprimé/,
    },
  ])(
    'affiche le bon placeholder ($reason) sans fuite du parent',
    ({ reason, label, explanation }) => {
      renderThreadParent(reason);

      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByText(new RegExp(SECRET_CONTENT))).toBeNull();
      expect(screen.queryByText(new RegExp(SECRET_HANDLE))).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /En savoir plus/ }));
      expect(screen.getByText(explanation)).toBeTruthy();
      expect(screen.queryByText(new RegExp(SECRET_CONTENT))).toBeNull();
      expect(screen.queryByText(new RegExp(SECRET_HANDLE))).toBeNull();
    }
  );
});
