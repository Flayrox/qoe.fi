// @vitest-environment jsdom
// =====================================================================
// 🧪 ArticleAnnotatorView — trois garanties de durcissement (L20c3)
// =====================================================================
// 1. Une date d'article illisible ne casse plus la page : le rendu passe par
//    la primitive partagée (`niceDateShort`), qui rend `null` au lieu de
//    laisser `Date#toISOString()` jeter un `RangeError` pendant le rendu.
// 2. Les surlignages d'un article ne repeignent jamais l'article suivant :
//    une réponse qui arrive après le changement d'article est ignorée (même
//    course que R121, côté annotateur).
// 3. Un signet refusé par le serveur remonte un message et rend l'état
//    précédent (F264 : un échec ne doit jamais être muet).
// 4. Aucun libellé visible ne contourne `t` (temps de lecture, paywall) : une
//    chaîne en dur est invisible pour les traducteurs et sort du contrat i18n.
// L'annotateur est réel ; le moteur de surlignage, les server actions, le
// magasin de shadow et les widgets voisins sont doublés — leur comportement
// est prouvé par leurs propres lots.
// =====================================================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockGetHighlights, mockToggleBookmark, mockToast, highlighter, tCalls } = vi.hoisted(
  () => ({
    mockGetHighlights: vi.fn(),
    mockToggleBookmark: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    highlighter: { current: null as Record<string, unknown> | null },
    /** Chaque chaîne rendue par `t` — sert de preuve qu'un libellé est traduit. */
    tCalls: [] as string[],
  })
);

/** Promesse dont on choisit le moment de résolution. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

vi.mock('@qoe/ui/toast', () => ({ toast: mockToast }));

vi.mock('@qoe/sdk', () => ({
  getArticleHighlightsAction: mockGetHighlights,
  createHighlightAction: vi.fn(async () => ({ ok: true })),
  upvoteHighlightAction: vi.fn(async () => ({ ok: true })),
  createAnnotationCommentAction: vi.fn(async () => ({ ok: true })),
  toggleHighlightPrivacyAction: vi.fn(async () => ({ ok: true })),
  updateHighlightNoteAction: vi.fn(async () => ({ ok: true })),
  deleteHighlightAction: vi.fn(async () => ({ ok: true })),
  citeAnnotationAction: vi.fn(async () => ({ ok: true })),
  useArticleShadow: () => ({}),
  useActorShadow: () => ({}),
  updateArticleShadow: vi.fn(),
  updateActorShadow: vi.fn(),
  // Même contrat que la primitive réelle : optimiste, puis rollback + `onError`
  // sur échec — sans rejet sortant.
  withShadowMutation: vi.fn(
    async (opts: {
      optimisticUpdate?: () => void;
      mutation?: () => Promise<unknown>;
      rollback?: () => void;
      onError?: (err: unknown) => void;
    }) => {
      try {
        opts.optimisticUpdate?.();
        return await opts.mutation?.();
      } catch (err) {
        opts.rollback?.();
        opts.onError?.(err);
        return undefined;
      }
    }
  ),
}));

vi.mock('@qoe/sdk/actions/feed', () => ({
  toggleBookmarkArticleHomeAction: mockToggleBookmark,
  toggleFollowCreatorHomeAction: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@qoe/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'reader-1', email: 'liseuse@qoe.fi' } } }),
    },
  }),
}));

vi.mock('@qoe/ui/annotations', () => ({
  TextHighlighter: (props: Record<string, unknown>) => {
    highlighter.current = props;
    return <div data-testid="highlighter" />;
  },
  createAnnotationCallbacks: () => ({}),
  appendAnnotation: (list: unknown[], item: unknown) => [...list, item],
}));

vi.mock('@qoe/ui/security', () => ({
  sanitizeArticleHtml: (html: string) => html,
}));

vi.mock('@/lib/canonical-document', () => ({
  getCanonicalDocumentAction: vi.fn(async () => null),
}));

vi.mock('@/lib/use-plus', () => ({ usePlus: () => true }));

vi.mock('../ArticleComments', () => ({ ArticleComments: () => null }));
vi.mock('../ArticleSummary', () => ({ ArticleSummary: () => null }));
vi.mock('../SimilarArticlesSection', () => ({ SimilarArticlesSection: () => null }));

vi.mock('@qoe/analytics', () => ({ useArticleReadingTracker: vi.fn() }));

vi.mock('@qoe/ui', () => ({
  SubscribeForm: () => null,
  SafeAvatar: () => <span data-testid="avatar" />,
  ProfileHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
  useFeatureAnnouncement: () => ({ open: vi.fn() }),
}));

vi.mock('@qoe/ui/ui/CertifiedBadge', () => ({ CertifiedBadge: () => null }));

vi.mock('@qoe/ui/reader', () => ({
  ReadingPreferencesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReadingPreferences: () => ({ preferences: { bionicReading: false } }),
  ReadingSettingsSheet: () => null,
  ReadingRuler: () => null,
  TextToSpeechPlayer: () => null,
  getReaderTypographyClasses: () => '',
  formatBionicHtml: (html: string) => html,
}));

vi.mock('@qoe/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@qoe/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@qoe/config', () => ({
  getArticleUrl: () => 'https://qoe.fi/article',
}));

vi.mock('@qoe/flags', () => ({ useFlag: () => false }));

vi.mock('next/image', () => ({ default: () => <span data-testid="cover" /> }));

vi.mock('lucide-react', () => {
  const Icon = () => <span />;
  const names = [
    'Bookmark',
    'BookMarked',
    'Check',
    'FileX',
    'Lock',
    'Share2',
    'UserCheck',
    'UserPlus',
  ];
  return Object.fromEntries(names.map((name) => [name, Icon]));
});

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return message;
  },
}));

import { ArticleAnnotatorView } from '../ArticleAnnotatorView';

const ARTICLE = {
  id: 'art-1',
  title: 'La ville sans voiture',
  slug: 'la-ville-sans-voiture',
  content: '<p>Un contenu</p>',
  createdAt: '2026-10-01T10:00:00.000Z',
  author: { id: 'u1', name: 'Camille', username: 'camille', type: 'PERSONAL' },
};

const PRIVATE_A = { id: 'h-a', isPublic: false, isOfficial: false };
const PRIVATE_B = { id: 'h-b', isPublic: false, isOfficial: false };

beforeEach(() => {
  highlighter.current = null;
  tCalls.length = 0;
  mockGetHighlights.mockReset();
  mockGetHighlights.mockResolvedValue({ ok: true, data: { highlights: [] } });
  mockToggleBookmark.mockReset();
  mockToast.error.mockClear();
});

afterEach(() => cleanup());

describe('ArticleAnnotatorView — durcissement', () => {
  it('affiche un article dont la date est illisible, sans jeter', async () => {
    render(<ArticleAnnotatorView article={{ ...ARTICLE, createdAt: 'date-inconnue' }} />);
    // Laisse les effets (session, surlignages, document) se poser avant d'observer.
    await act(async () => {});

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ARTICLE.title);
    expect(screen.queryByText(/Invalid Date/i)).toBeNull();
    expect(document.querySelector('time')).toBeNull();
  });

  it("n'applique jamais les surlignages d'un article au suivant", async () => {
    const slow = deferred<{ ok: boolean; data: { highlights: unknown[] } }>();
    const fast = deferred<{ ok: boolean; data: { highlights: unknown[] } }>();
    mockGetHighlights.mockImplementation(({ articleId }: { articleId: string }) =>
      articleId === 'art-a' ? slow.promise : fast.promise
    );

    const { rerender } = render(
      <ArticleAnnotatorView article={{ ...ARTICLE, id: 'art-a', slug: 'article-a' }} />
    );
    await waitFor(() => expect(mockGetHighlights).toHaveBeenCalledWith({ articleId: 'art-a' }));

    rerender(<ArticleAnnotatorView article={{ ...ARTICLE, id: 'art-b', slug: 'article-b' }} />);
    await waitFor(() => expect(mockGetHighlights).toHaveBeenCalledWith({ articleId: 'art-b' }));

    // La réponse de l'article précédent arrive en retard : elle ne doit rien repeindre.
    await act(async () => {
      slow.resolve({ ok: true, data: { highlights: [PRIVATE_A] } });
    });
    expect(highlighter.current?.initialHighlights).toEqual([]);

    await act(async () => {
      fast.resolve({ ok: true, data: { highlights: [PRIVATE_B] } });
    });
    await waitFor(() => expect(highlighter.current?.initialHighlights).toEqual([PRIVATE_B]));
  });

  it('rend son état précédent et le dit quand le signet est refusé', async () => {
    mockToggleBookmark.mockResolvedValue({ ok: false });

    render(<ArticleAnnotatorView article={{ ...ARTICLE, isBookmarked: false }} />);
    const button = await screen.findByTitle('Mettre en signet');

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(screen.getByTitle('Mettre en signet')).toBeTruthy();
  });
});

describe('ArticleAnnotatorView — i18n', () => {
  it('passe le temps de lecture par `t` (valeur lue)', async () => {
    render(<ArticleAnnotatorView article={{ ...ARTICLE, readingTime: 3 }} />);
    await act(async () => {});

    expect(tCalls).toContain('3 min de lecture');
    expect(screen.getByText('3 min de lecture')).toBeTruthy();
  });

  it('passe le temps de lecture par `t` (borne : 1 et repli à 5)', async () => {
    render(<ArticleAnnotatorView article={{ ...ARTICLE, readingTime: 1 }} />);
    await act(async () => {});
    expect(tCalls).toContain('1 min de lecture');

    cleanup();
    tCalls.length = 0;

    render(<ArticleAnnotatorView article={{ ...ARTICLE, readingTime: 0 }} />);
    await act(async () => {});
    // « min » est invariable : pas de forme plurielle, seul le repli compte.
    expect(tCalls).toContain('5 min de lecture');
  });

  it('passe les libellés du paywall par `t`', async () => {
    render(
      <ArticleAnnotatorView article={{ ...ARTICLE, isPremium: true, accessGranted: false }} />
    );
    await act(async () => {});

    expect(tCalls).toContain('Écrit réservé aux membres Premium');
    expect(tCalls).toContain(
      'La suite de cette publication est exclusivement réservée aux abonnés de'
    );
    expect(tCalls).toContain("S'abonner pour débloquer");
    // La mise en avant du nom reste rendue dans le `<strong>`.
    expect(screen.getByText('Camille', { selector: 'strong' })).toBeTruthy();
  });

  it('interdit la réapparition d’un libellé en dur (garde de source)', () => {
    // jsdom transforme les modules en URL `http://`, `import.meta.url` n'est donc
    // pas un `file://` : on repart de la racine du paquet (`apps/core`).
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/social/ArticleAnnotatorView.tsx'),
      'utf8'
    );
    const labels = [
      'min de lecture',
      'Écrit réservé aux membres Premium',
      "S'abonner pour débloquer",
      'La suite de cette publication est exclusivement réservée aux abonnés de',
    ];
    const offenders = source
      .split('\n')
      .filter((line) => labels.some((label) => line.includes(label)) && !line.includes('t`'));
    expect(offenders).toEqual([]);
  });
});
