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
  usePathname: () => '/repondeur/thought/root-1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/image', () => ({ default: 'img' }));

vi.mock('@/components/article-overlay/ArticleOverlayProvider', () => ({
  useArticleOverlay: () => null,
}));

vi.mock('@/components/thought-overlay/context', () => ({
  useThoughtOverlay: () => null,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import { mapGoThreadToWebThread } from '@qoe/sdk/actions/feed/mappers';
import type { OptimisticThought } from '../ThoughtThreadContext';
import { ThoughtThreadRoot } from '../ThoughtThreadRoot';
import { ThoughtThreadParentContext } from '../ThoughtThreadParentContext';
import { ThoughtThreadList } from '../ThoughtThreadList';

const SECRET_CONTENT = 'Contenu secret du parent imbrique';
const SECRET_HANDLE = 'parent-imbrique-bloque';

type RawPost = Record<string, unknown>;
type ThreadNode = {
  id: string;
  parent?: ThreadNode | null;
  parentUnavailable?: boolean;
  parentUnavailableReason?: string | null;
  replies?: ThreadNode[];
};

function makeAuthor(username: string) {
  return {
    id: `author-${username}`,
    name: username,
    username,
    subdomain: null,
    logoUrl: null,
    isCertified: false,
  };
}

function makePost(overrides: RawPost): RawPost {
  return {
    id: 'post-1',
    content: 'Contenu',
    authorId: 'author-post',
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
    parentUnavailable: false,
    parentUnavailableReason: null,
    parent: null,
    author: makeAuthor('auteur'),
    attachments: [],
    poll: null,
    likes: [],
    reposts: [],
    _count: { likes: 0, replies: 0, reposts: 0 },
    liked: false,
    reposted: false,
    replies: [],
    ...overrides,
  };
}

function makeSecretParent(id: string) {
  return makePost({
    id,
    parentId: null,
    content: SECRET_CONTENT,
    author: makeAuthor(SECRET_HANDLE),
  });
}

function makeReply(id: string, parentId: string, content: string, overrides: RawPost = {}) {
  return makePost({
    id,
    parentId,
    rootId: 'root-1',
    content,
    ...overrides,
  });
}

function makeRoot(): RawPost {
  return makePost({
    id: 'root-1',
    content: 'Racine visible',
    replies: [
      makeReply('direct-1', 'root-1', 'Réponse directe'),
      makeReply('nested-1', 'direct-1', 'Réponse imbriquée normale'),
      // Deux orphelines bloquées : une par direction. Le client ne doit voir
      // qu'un seul motif générique, sans savoir qui a bloqué qui.
      makeReply('orphan-blocked-a', 'blocked-a', 'Orpheline bloquée A', {
        parentUnavailable: true,
        parentUnavailableReason: 'blocked',
        parent: makeSecretParent('blocked-a'),
      }),
      makeReply('orphan-blocked-b', 'blocked-b', 'Orpheline bloquée B', {
        parentUnavailable: true,
        parentUnavailableReason: 'blocked',
        parent: makeSecretParent('blocked-b'),
      }),
      makeReply('orphan-deleted', 'deleted-parent', 'Orpheline supprimée', {
        parentUnavailable: true,
        parentUnavailableReason: 'deleted',
      }),
      makeReply('orphan-unavailable', 'moderated-parent', 'Orpheline modérée', {
        parentUnavailable: true,
        parentUnavailableReason: 'unavailable',
      }),
      // Descendance multi-niveaux : l'enfant reste sous l'orpheline visible,
      // il ne doit pas gagner un second bandeau.
      makeReply('orphan-child', 'orphan-blocked-a', "Enfant de l'orpheline"),
    ],
  });
}

function flatten(nodes: ThreadNode[] = []): ThreadNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.replies)]);
}

function renderThread(raw: RawPost = makeRoot(), withList = true) {
  const mapped = mapGoThreadToWebThread(raw as never);
  if (!mapped) throw new Error('thread non mappé');

  return render(
    <ThoughtThreadRoot
      postId={mapped.id}
      currentUserId="viewer-1"
      dbUser={null}
      initialPost={mapped as unknown as OptimisticThought}
      standalone
    >
      <ThoughtThreadParentContext />
      {withList && <ThoughtThreadList />}
    </ThoughtThreadRoot>
  );
}

afterEach(() => {
  cleanup();
});

describe('thread imbriqué — parent inaccessible', () => {
  it('affiche le même bandeau sur chaque orpheline, sans fuite ni doublon', () => {
    renderThread();

    expect(screen.getAllByText('Réponse à un compte bloqué')).toHaveLength(2);
    expect(screen.getAllByText('Réponse à un contenu indisponible')).toHaveLength(2);
    expect(screen.getByText('Réponse directe')).toBeTruthy();
    expect(screen.getByText('Réponse imbriquée normale')).toBeTruthy();
    expect(screen.getByText("Enfant de l'orpheline")).toBeTruthy();

    expect(screen.queryByText(new RegExp(SECRET_CONTENT))).toBeNull();
    expect(screen.queryByText(new RegExp(SECRET_HANDLE))).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /En savoir plus/ })[0]);
    expect(screen.getByText(/Le contenu de ce compte reste masqué/)).toBeTruthy();
    expect(screen.queryByText(new RegExp(SECRET_CONTENT))).toBeNull();
    expect(screen.queryByText(new RegExp(SECRET_HANDLE))).toBeNull();
  });

  it("ne rattache jamais un orphelin à un parent pourtant présent, et marque l'absence de flag", () => {
    const raw = makeRoot();
    (raw.replies as RawPost[]).push(
      makeReply('visible-parent', 'root-1', 'Parent visible'),
      makeReply('adversarial-orphan', 'visible-parent', 'Orpheline adversariale', {
        parentUnavailable: true,
        parentUnavailableReason: 'blocked',
        parent: makeSecretParent('visible-parent'),
      }),
      makeReply('orphan-no-flag', 'missing-parent', 'Orpheline sans flag')
    );

    const mapped = mapGoThreadToWebThread(raw as never);
    if (!mapped) throw new Error('thread non mappé');

    const nodes = flatten(mapped.replies as ThreadNode[]);
    const byId = new Map(nodes.map((node) => [node.id, node]));

    const visibleParent = byId.get('visible-parent');
    expect(visibleParent).toBeTruthy();
    expect(visibleParent?.replies?.some((reply) => reply.id === 'adversarial-orphan')).toBe(false);

    const adversarial = byId.get('adversarial-orphan');
    expect(adversarial?.parentUnavailable).toBe(true);
    expect(adversarial?.parent).toBeNull();

    const noFlag = byId.get('orphan-no-flag');
    expect(noFlag?.parentUnavailable).toBe(true);
    expect(noFlag?.parentUnavailableReason).toBe('unavailable');

    expect(byId.get('direct-1')?.replies?.map((reply) => reply.id)).toContain('nested-1');
    expect(byId.get('orphan-blocked-a')?.replies?.map((reply) => reply.id)).toContain(
      'orphan-child'
    );
  });

  it('signale aussi un ancêtre dont le parent est masqué', () => {
    const ancestor = makePost({
      id: 'ancestor-1',
      parentId: 'blocked-grandparent',
      rootId: 'root-2',
      content: 'Ancêtre visible',
      parentUnavailable: true,
      parentUnavailableReason: 'blocked',
      parent: makeSecretParent('blocked-grandparent'),
    });
    const target = makePost({
      id: 'target-1',
      parentId: 'ancestor-1',
      rootId: 'root-2',
      content: 'Cible visible',
      parent: ancestor,
    });

    renderThread(target, false);

    expect(screen.getAllByText('Réponse à un compte bloqué')).toHaveLength(1);
    expect(screen.getByText('Ancêtre visible')).toBeTruthy();
    expect(screen.queryByText(new RegExp(SECRET_CONTENT))).toBeNull();
    expect(screen.queryByText(new RegExp(SECRET_HANDLE))).toBeNull();
  });
});
