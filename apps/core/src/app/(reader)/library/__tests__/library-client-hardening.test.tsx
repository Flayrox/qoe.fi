// @vitest-environment jsdom
// =====================================================================
// 🧪 LibraryClient — mesure, annulation et quota
// =====================================================================
// Quatre garanties : un clic d'article est mesuré côté navigateur (pas dans
// les logs serveur), annuler un retrait ne ressuscite pas les retraits
// suivants, le quota de surlignages est visible, et l'export .md ne révoque pas
// son blob avant que le téléchargement ait démarré.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { mockTrackEvent, mockTrackServerEvent, mockToast, mockToggleBookmark } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
  mockTrackServerEvent: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  mockToggleBookmark: vi.fn(),
}));

vi.mock('@qoe/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/analytics')>();
  return { ...actual, trackEvent: mockTrackEvent, trackServerEvent: mockTrackServerEvent };
});
vi.mock('@qoe/ui/toast', () => ({ toast: mockToast }));
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@qoe/sdk/actions/feed', () => ({
  toggleBookmarkArticleHomeAction: (...args: unknown[]) => mockToggleBookmark(...args),
}));
vi.mock('@qoe/sdk/actions/highlights', () => ({
  deleteHighlightAction: vi.fn(),
  updateHighlightNoteAction: vi.fn(),
}));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? String(values[i]) : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

import { LibraryClient, type LibraryBookmark, type LibraryHighlight } from '../LibraryClient';

function makeBookmark(id: string, title: string): LibraryBookmark {
  return {
    id,
    createdAt: '2026-11-01T10:00:00.000Z',
    article: {
      id: `art_${id}`,
      slug: `slug-${id}`,
      title,
      content: '<p>Extrait.</p>',
      readingTime: 4,
      author: {
        name: 'Qoe',
        username: 'qoe',
        subdomain: null,
        customDomain: null,
        logoUrl: null,
      },
      category: null,
    },
  };
}

/** Compteur KPI « Articles sauvegardés » (non animé, contrairement aux cartes). */
function savedCount(): number {
  const label = screen.getByText('Articles sauvegardés');
  const value = label.parentElement?.querySelectorAll('span')[1];
  return Number(value?.textContent);
}

const highlight: LibraryHighlight = {
  id: 'h1',
  text: 'Un passage retenu.',
  note: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  article: {
    id: 'art_h1',
    title: 'Manifeste',
    slug: 'manifeste',
    publisher: {
      id: 'p1',
      name: 'Qoe',
      slug: 'qoe',
      subdomain: null,
      customDomain: null,
    },
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LibraryClient (L20b2b31)', () => {
  it('mesure le clic article côté navigateur, pas dans les logs serveur', async () => {
    render(<LibraryClient bookmarks={[makeBookmark('bm_1', 'Manifeste')]} highlights={[]} />);

    fireEvent.click(screen.getByText('Manifeste'));

    await waitFor(() =>
      expect(mockTrackEvent).toHaveBeenCalledWith('library_article_click', {
        articleId: 'art_bm_1',
        slug: 'slug-bm_1',
      })
    );
    // `trackServerEvent` n'écrit que dans les logs du serveur : appelée depuis un
    // clic navigateur, elle ne collecte rien et pollue la console.
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('annuler un retrait ne ressuscite pas un signet retiré après lui', async () => {
    mockToggleBookmark.mockResolvedValue({ ok: true });
    render(
      <LibraryClient
        bookmarks={[makeBookmark('bm_1', 'Premier'), makeBookmark('bm_2', 'Second')]}
        highlights={[]}
      />
    );

    // `AnimatePresence` garde la carte sortante dans le DOM : on cible la carte
    // du signet visé, pas le premier bouton venu.
    const removeButtonOf = (title: string) =>
      within(screen.getByText(title).closest('div.group') as HTMLElement).getByLabelText(
        'Retirer des signets'
      );

    fireEvent.click(removeButtonOf('Premier'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(1));

    fireEvent.click(removeButtonOf('Second'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(2));
    expect(savedCount()).toBe(0);

    // Annulation du premier retrait : « Second » avait été retiré après, il doit le rester.
    const undo = mockToast.success.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    undo.action.onClick();

    // Un seul signet revient : celui annulé, pas l'instantané complet de l'époque.
    await waitFor(() => expect(savedCount()).toBe(1));
    expect(mockToggleBookmark).toHaveBeenCalledTimes(3);
  });

  it('affiche le quota de surlignages fourni par le serveur', () => {
    render(
      <LibraryClient
        bookmarks={[]}
        highlights={[highlight]}
        initialTab="highlights"
        highlightQuota={{ count: 42, limit: 50, plus: false }}
      />
    );

    expect(screen.getByText('42 / 50')).toBeDefined();
  });

  it("n'révoque pas l'URL du blob avant que le téléchargement démarre", () => {
    const createObjectURL = vi.fn(() => 'blob:qoe-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));

    render(<LibraryClient bookmarks={[]} highlights={[highlight]} />);
    fireEvent.click(screen.getByText('Exporter (.md)'));

    expect(createObjectURL).toHaveBeenCalled();
    // Une révocation synchrone annule le téléchargement sur Firefox et Safari.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
