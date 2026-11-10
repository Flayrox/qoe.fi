// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/repondeur/with_replies',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/image', () => ({ default: 'img' }));

// Le provider d'article entraîne tout le tiroir de lecture : hors sujet ici.
vi.mock('@/components/article-overlay/ArticleOverlayProvider', () => ({
  useArticleOverlay: () => null,
}));

vi.mock('@/components/thought-overlay/context', () => ({
  useThoughtOverlay: () => null,
}));

// useMutation exige un QueryClientProvider : on isole uniquement ce hook.
vi.mock('@qoe/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/sdk')>();
  return {
    ...actual,
    useDeletePostMutation: () => ({ mutateAsync: vi.fn() }),
  };
});

import { mapProfileSlice } from '@qoe/sdk/actions/feed/mappers';
import { ProfileView } from '../ProfileView';

const SECRET_CONTENT = 'Contenu secret du parent';
const SECRET_HANDLE = 'parent-bloque';

function makeSlice(reason: 'blocked' | 'deleted') {
  const parent = {
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
  };

  return {
    id: 'reply-1',
    rootPost: null,
    // Payload adversarial : le parent est présent ET marqué indisponible.
    // Le mapping doit couper le contenu dans tous les cas.
    parentPost: parent,
    targetPost: {
      ...parent,
      id: 'reply-1',
      content: 'La réponse visible',
      authorId: 'author-2',
      parentId: 'parent-1',
      rootId: 'parent-1',
      parentUnavailable: true,
      parentUnavailableReason: reason,
      parent,
      author: {
        id: 'author-2',
        name: 'Répondeur',
        username: 'repondeur',
        logoUrl: null,
        isCertified: false,
      },
    },
    isIncompleteThread: false,
    hiddenIntermediateCount: 0,
    parentUnavailable: true,
    parentUnavailableReason: reason,
  };
}

function renderReply(reason: 'blocked' | 'deleted') {
  const post = mapProfileSlice(makeSlice(reason) as never);
  return render(
    <ProfileView
      profileUser={{
        id: 'profile-1',
        ownerUserId: 'author-2',
        type: 'PERSONAL',
        name: 'Répondeur',
        username: 'repondeur',
        subdomain: null,
        customDomain: null,
        logoUrl: null,
        heroText: null,
        createdAt: '2020-01-01T00:00:00.000Z',
        posts: [post],
        articles: [],
        _count: { followers: 3, following: 2, posts: 1 },
      }}
      currentUserId="viewer-1"
      isOwnProfile={false}
      initialIsFollowing={false}
      initialTab="with_replies"
      initialPublisherId="profile-1"
    />
  );
}

afterEach(() => {
  cleanup();
});

describe('ProfileView — réponse à un parent masqué', () => {
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
      renderReply(reason);

      expect(screen.getByText('La réponse visible')).toBeTruthy();
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
