// @vitest-environment jsdom
// =====================================================================
// 🧪 ArticleOverlayProvider monté pour de vrai (R128)
// =====================================================================
// Le provider n'avait jamais été monté : ni son timeout réseau, ni son
// démontage, ni `popstate`, ni le focus, ni le verrou de scroll n'étaient
// exercés. Seule la partie pure (`overlay-state`) était testée.
// L'annotateur (L20c3) et les primitives de confort sont doublés ; le
// provider, le drawer et sa mécanique DOM sont réels.
// =====================================================================

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ARTICLE = {
  id: 'art-1',
  title: 'La ville sans voiture',
  slug: 'la-ville-sans-voiture',
  content: 'Un contenu',
  createdAt: '2026-10-01T10:00:00.000Z',
  author: { id: 'u1', name: 'Camille', username: 'camille' },
};

vi.mock('@qoe/sdk/actions/feed', () => ({
  getArticleThreadAction: vi.fn(async () => ({ ok: true, data: { article: ARTICLE } })),
}));
vi.mock('@/components/social/ArticleAnnotatorView', () => ({
  ArticleAnnotatorView: ({
    article,
  }: {
    article?: { title?: string; isLoading?: boolean; isError?: boolean; errorMessage?: string };
  }) => (
    <div
      data-testid="annotator"
      data-title={article?.title ?? ''}
      data-loading={String(Boolean(article?.isLoading))}
      data-error={String(Boolean(article?.isError))}
      data-error-message={article?.errorMessage ?? ''}
    />
  ),
}));
vi.mock('@qoe/ui', () => ({ ProgressiveBlur: () => null }));
vi.mock('@qoe/ui/reader', () => ({
  TextToSpeechProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../social/DockedReaderToolbar', () => ({
  DockedReaderToolbar: () => <div data-testid="docked-toolbar" />,
}));

import { ArticleOverlayProvider, useArticleOverlay } from '../ArticleOverlayProvider';

function Probe({ slug = ARTICLE.slug }: { slug?: string }) {
  const api = useArticleOverlay();
  return (
    <div>
      <button type="button" onClick={() => api?.openArticle({ slug })}>
        ouvrir
      </button>
      <button type="button" onClick={() => api?.closeArticle()}>
        fermer
      </button>
      <span data-testid="state" data-open={String(api?.isOpen)} data-slug={api?.activeSlug ?? ''} />
    </div>
  );
}

function mount(slug?: string) {
  return render(
    <ArticleOverlayProvider currentUserProfile={null}>
      <Probe slug={slug} />
    </ArticleOverlayProvider>
  );
}

const annotator = () => screen.getByTestId('annotator');

beforeEach(() => {
  window.history.replaceState(null, '', '/home');
  document.body.style.overflow = '';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ArticleOverlayProvider — ouverture, focus, scroll', () => {
  it('ouvre l’article, verrouille le scroll et déplace le focus dans la surcouche', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ ok: true, data: { article: ARTICLE } }),
      }))
    );

    mount();
    const trigger = screen.getByText('ouvrir');
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByTestId('state').dataset.open).toBe('true'));
    // Verrou de scroll posé par le drawer réel.
    expect(document.body.style.overflow).toBe('hidden');

    // Focus déplacé dans le panneau (le provider cible [data-testid=article-drawer]).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('article-drawer')));

    // Et le contenu reçu du serveur remplace la coquille.
    await waitFor(() => expect(annotator().dataset.loading).toBe('false'));
    expect(annotator().dataset.title).toBe(ARTICLE.title);
  });

  it('referme sur popstate et rend le focus au déclencheur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ ok: true, data: { article: ARTICLE } }),
      }))
    );

    mount();
    const trigger = screen.getByText('ouvrir');
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByTestId('state').dataset.open).toBe('true'));

    act(() => {
      window.history.replaceState(null, '', '/home');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(screen.getByTestId('state').dataset.open).toBe('false'));
    // Le verrou est relâché et le focus revient là où le lecteur était.
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('ArticleOverlayProvider — réseau (R128)', () => {
  it('finit en état d’erreur quand le fetch ne répond jamais', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const never = new Promise<never>(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(() => never)
    );

    // Slug neuf : le cache de thread du module ne doit pas court-circuiter.
    mount('jamais-repondu');
    await act(async () => {
      fireEvent.click(screen.getByText('ouvrir'));
    });
    expect(annotator().dataset.loading).toBe('true');

    // 10 s de silence : la coquille doit céder la place à une erreur, pas
    // rester en squelette indéfiniment.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(annotator().dataset.error).toBe('true');
    expect(annotator().dataset.loading).toBe('false');
    expect(annotator().dataset.errorMessage).not.toBe('');
  });

  it('annule la requête en cours au démontage', async () => {
    const never = new Promise<never>(() => {});
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return never;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = mount('annule-au-demontage');
    fireEvent.click(screen.getByText('ouvrir'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const signal = calls[0]?.init?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    unmount();
    // Sans annulation, la promesse continue et peut écrire dans un arbre démonté.
    expect(signal?.aborted).toBe(true);
  });
});

describe('ArticleOverlayProvider — préchargement', () => {
  it('précharge au survol et ouvre sans squelette', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, data: { article: ARTICLE } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const link = document.createElement('a');
    link.setAttribute('data-article-link', '');
    link.setAttribute('data-article-slug', 'precharge');
    link.href = '/camille/a/precharge';
    document.body.appendChild(link);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mount();

    await act(async () => {
      link.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(150);
    });

    // Le survol (120 ms) déclenche un prefetch vers la route d'article.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/articles/precharge',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    link.remove();
  });
});
