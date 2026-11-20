// @vitest-environment jsdom
// =====================================================================
// 🧪 Chaîne de lecture d'article — garanties de durcissement (L20c4)
// =====================================================================
// Sept garanties, toutes rouges sur le code d'avant le lot :
//  1. les commentaires d'un article ne repeignent jamais le suivant ;
//  2. supprimer un commentaire racine retire aussi ses réponses du compte ;
//  3. le résumé IA d'un article ne survit pas au changement d'article ;
//  4. les recommandations ne survivent pas au changement d'article ;
//  5. le TTS mobile applique le même verrou Plus que le desktop ;
//  6. fermer le tiroir rend le défilement du document tel qu'il était ;
//  7. le tiroir est une boîte de dialogue nommée (`role="dialog"`).
// Les composants sont réels ; server actions, UI partagée et mouvement sont
// doublés (leur contrat est prouvé par leurs propres lots).
// =====================================================================

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  mockComments,
  mockDeleteComment,
  mockSummarize,
  mockSimilar,
  mockFlag,
  mockPlus,
  ttsProps,
} = vi.hoisted(() => ({
  mockComments: vi.fn(),
  mockDeleteComment: vi.fn(),
  mockSummarize: vi.fn(),
  mockSimilar: vi.fn(),
  mockFlag: vi.fn(() => true),
  mockPlus: vi.fn((): boolean | null => false),
  ttsProps: [] as Record<string, unknown>[],
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
    Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings),
}));

vi.mock('@qoe/sdk/actions/articles', () => ({
  getArticleCommentsAction: mockComments,
  deleteArticleCommentAction: mockDeleteComment,
  postArticleCommentAction: vi.fn(async () => ({ ok: false })),
  getSimilarArticlesAction: mockSimilar,
}));

vi.mock('@qoe/sdk', () => ({ summarizeArticleAction: mockSummarize }));

vi.mock('@qoe/flags', () => ({ useFlag: mockFlag }));
vi.mock('@/lib/use-plus', () => ({ usePlus: mockPlus }));

vi.mock('@qoe/ui', () => ({
  SafeAvatar: () => <span data-testid="avatar" />,
  ProgressiveBlur: () => null,
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useFeatureAnnouncement: () => ({ open: vi.fn() }),
}));

vi.mock('@qoe/ui/reader', () => ({
  TextToSpeechPlayer: (props: Record<string, unknown>) => {
    ttsProps.push(props);
    return <span data-testid="tts" />;
  },
  TextToSpeechProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ReadingSettingsSheet: () => null,
}));

vi.mock('@qoe/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@qoe/config/routes', () => ({ getArticleUrl: () => '/article-cible' }));

vi.mock('@qoe/utils', () => ({ cn: (...classes: unknown[]) => classes.filter(Boolean).join(' ') }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => {
      const dom = { ...rest };
      delete dom.initial;
      delete dom.animate;
      delete dom.exit;
      delete dom.transition;
      return <div {...(dom as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span />;
  const names = [
    'Bookmark',
    'BookMarked',
    'Check',
    'Loader2',
    'MessageSquare',
    'MoreHorizontal',
    'Send',
    'Share',
    'Share2',
    'Sparkles',
    'Clock',
    'Trash2',
    'ExternalLink',
    'X',
  ];
  return Object.fromEntries(names.map((name) => [name, Icon]));
});

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../ArticleAnnotatorView', () => ({
  ArticleAnnotatorView: ({ article }: { article: { title?: string } }) => (
    <div data-testid="annotator">{article?.title}</div>
  ),
}));

import { ArticleComments } from '../ArticleComments';
import { ArticleSummary } from '../ArticleSummary';
import { SimilarArticlesSection } from '../SimilarArticlesSection';
import { DockedReaderToolbar } from '../DockedReaderToolbar';
import { ArticleReaderDrawer } from '../ArticleReaderDrawer';
import { ReaderToolbarProvider } from '../ReaderToolbarContext';

const ARTICLE = {
  id: 'art-1',
  title: 'La ville sans voiture',
  slug: 'la-ville-sans-voiture',
  content: '<p>Un contenu</p>',
  createdAt: '2026-10-01T10:00:00.000Z',
  author: { id: 'u1', name: 'Camille', username: 'camille', type: 'PERSONAL' },
};

const commentFixture = (id: string, parentId: string | null = null) => ({
  id,
  content: `commentaire-${id}`,
  parentId,
  articleId: 'art-1',
  author: { id: 'u2', name: 'Nadia', username: 'nadia', logoUrl: null },
  createdAt: '2026-10-02T10:00:00.000Z',
});

const similarFixture = (id: string) => ({
  id,
  title: `Suggestion ${id}`,
  slug: `suggestion-${id}`,
  isPremium: false,
  readingTime: 4,
  createdAt: '2026-10-02T10:00:00.000Z',
  publisherId: 'p1',
  authorId: 'u1',
  authorName: 'Camille',
  authorUsername: 'camille',
  authorLogo: null,
  publisherName: 'Qoefi',
  score: 0.9,
});

beforeEach(() => {
  ttsProps.length = 0;
  mockComments.mockReset();
  mockDeleteComment.mockReset();
  mockSummarize.mockReset();
  mockSimilar.mockReset();
  mockFlag.mockReset();
  mockFlag.mockReturnValue(true);
  mockPlus.mockReset();
  mockPlus.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('ArticleComments', () => {
  it("n'affiche jamais les commentaires d'un article sous le suivant", async () => {
    const slow = deferred<{ ok: boolean; data: unknown[] }>();
    const fast = deferred<{ ok: boolean; data: unknown[] }>();
    mockComments.mockImplementation((articleId: string) =>
      articleId === 'art-a' ? slow.promise : fast.promise
    );

    const { rerender } = render(<ArticleComments articleId="art-a" />);
    await waitFor(() => expect(mockComments).toHaveBeenCalledWith('art-a'));
    rerender(<ArticleComments articleId="art-b" />);
    await waitFor(() => expect(mockComments).toHaveBeenCalledWith('art-b'));

    await act(async () => {
      slow.resolve({ ok: true, data: [commentFixture('de-a')] });
    });
    expect(screen.queryByText('commentaire-de-a')).toBeNull();

    await act(async () => {
      fast.resolve({ ok: true, data: [commentFixture('de-b')] });
    });
    await waitFor(() => expect(screen.getByText('commentaire-de-b')).toBeTruthy());
  });

  it('ne compte plus les réponses d’un commentaire racine supprimé', async () => {
    mockComments.mockResolvedValue({
      ok: true,
      data: [commentFixture('racine', null), commentFixture('reponse', 'racine')],
    });
    mockDeleteComment.mockResolvedValue({ ok: true, data: null });

    render(<ArticleComments articleId="art-1" currentUserId="u2" />);
    await waitFor(() => expect(screen.getByText('commentaire-reponse')).toBeTruthy());
    expect(screen.getByText('(2)')).toBeTruthy();

    const supprimer = screen.getAllByText('Supprimer')[0];
    await act(async () => {
      fireEvent.click(supprimer);
    });

    await waitFor(() => expect(screen.queryByText('commentaire-racine')).toBeNull());
    expect(screen.queryByText('commentaire-reponse')).toBeNull();
    // La réponse orpheline ne doit plus être comptée dans l'en-tête.
    expect(screen.queryByText('(1)')).toBeNull();
    expect(screen.queryByText('(2)')).toBeNull();
  });
});

describe('ArticleSummary', () => {
  it("ne garde pas le résumé d'un article sur le suivant", async () => {
    mockSummarize.mockResolvedValue({
      ok: true,
      data: { summary: 'Résumé du premier article', usage: { remaining: 4, limit: 5 } },
    });

    const { rerender } = render(<ArticleSummary articleId="art-a" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Résumer cet article'));
    });
    await waitFor(() => expect(screen.getByText('Résumé du premier article')).toBeTruthy());

    rerender(<ArticleSummary articleId="art-b" />);

    expect(screen.queryByText('Résumé du premier article')).toBeNull();
    expect(screen.getByText('Résumer cet article')).toBeTruthy();
  });
});

describe('SimilarArticlesSection', () => {
  it("ne montre pas les recommandations d'un article sous le suivant", async () => {
    mockSimilar.mockImplementation(({ articleId }: { articleId: string }) =>
      articleId === 'art-a'
        ? Promise.resolve({ ok: true, data: [similarFixture('a')] })
        : Promise.resolve({ ok: false, error: { message: 'indisponible' } })
    );

    const { rerender } = render(<SimilarArticlesSection articleId="art-a" />);
    await waitFor(() => expect(screen.getByText('Suggestion a')).toBeTruthy());

    rerender(<SimilarArticlesSection articleId="art-b" />);
    await waitFor(() => expect(mockSimilar).toHaveBeenCalledWith({ articleId: 'art-b' }));

    expect(screen.queryByText('Suggestion a')).toBeNull();
  });
});

describe('DockedReaderToolbar', () => {
  it('applique le même verrou Plus au TTS mobile qu’au TTS desktop', () => {
    render(
      <ReaderToolbarProvider>
        <DockedReaderToolbar articleTitle="La ville sans voiture" />
      </ReaderToolbarProvider>
    );

    expect(ttsProps.length).toBeGreaterThanOrEqual(2); // desktop + mobile
    for (const props of ttsProps) {
      expect(props.locked).toBe(true);
      expect(typeof props.onLockedClick).toBe('function');
    }
  });
});

describe('ArticleReaderDrawer', () => {
  it('rend au document son défilement d’origine à la fermeture', () => {
    document.body.style.overflow = 'scroll';

    const { rerender } = render(
      <ArticleReaderDrawer isOpen article={ARTICLE} onClose={() => {}} />
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<ArticleReaderDrawer isOpen={false} article={ARTICLE} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('expose une boîte de dialogue nommée', () => {
    render(<ArticleReaderDrawer isOpen article={ARTICLE} onClose={() => {}} />);

    const dialog = screen.getByRole('dialog', { name: ARTICLE.title });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Le focus entre dans le panneau : le clavier ne reste pas derrière.
    expect(document.activeElement).toBe(dialog);
  });
});
