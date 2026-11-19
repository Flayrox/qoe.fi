// @vitest-environment jsdom
// =====================================================================
// 🧪 EPUBs — panne d'action, export, import et reprise de lecture
// =====================================================================
// Cinq garanties : une action de note qui rejette ne colle pas le bouton en
// « enregistrement », l'emport hors-ligne n'immobilise pas la liseuse, l'export
// .md ne révoque pas son blob avant le téléchargement, l'import de 20 Mo porte
// un timeout, et le montage ne remet pas le lecteur en haut du chapitre.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockToast, mockSdk } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  mockSdk: {
    getEbookOfflinePackAction: vi.fn(),
    setEbookProgressAction: vi.fn(),
    addEbookNoteAction: vi.fn(),
    deleteEbookNoteAction: vi.fn(),
    updateEbookNoteAction: vi.fn(),
    deleteEbookAction: vi.fn(),
  },
}));

vi.mock('@qoe/ui/toast', () => ({ toast: mockToast }));
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@qoe/sdk', () => mockSdk);
vi.mock('@qoe/ui/security', () => ({
  sanitizeArticleHtml: (html?: string) => html ?? '',
}));
vi.mock('@qoe/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    options,
  }: {
    value: string;
    onValueChange?: (v: string) => void;
    options: { id: string; label: string }[];
  }) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const stableTts = {
  stopPlayback: vi.fn(),
  openAndPlay: vi.fn(),
  isPlaying: false,
  currentParagraphIndex: null as number | null,
};
const stableAnnouncement = { open: vi.fn() };

vi.mock('@qoe/ui/reader', () => ({
  TextToSpeechProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTextToSpeech: () => stableTts,
}));
vi.mock('@qoe/ui', () => ({
  useFeatureAnnouncement: () => stableAnnouncement,
  SafeImage: 'img',
}));
vi.mock('@/lib/offline-store', () => ({
  browserOfflineStorage: () => ({}),
  hasOfflinePackAsync: vi.fn(async () => false),
  removeOfflinePackAsync: vi.fn(async () => undefined),
  saveOfflinePackAsync: vi.fn(async () => true),
}));

import { EbookReader } from '../[id]/EbookReader';
import { EbookNotes } from '../[id]/EbookNotes';
import { EbooksClient } from '../EbooksClient';
import { AllNotesClient } from '../notes/AllNotesClient';

const book = {
  id: 'eb_1',
  title: 'Un livre',
  author: 'Autrice',
  chapters: [
    { title: 'Un', html: '<p>Premier paragraphe.</p>' },
    { title: 'Deux', html: '<p>Second paragraphe.</p>' },
  ],
  progressChapter: 0,
  progressParagraph: 2,
  language: 'fr',
  chapterCount: 2,
  hasCover: false,
  progressPct: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
};

const note = {
  id: 'n_1',
  ebookId: 'eb_1',
  ebookTitle: 'Un livre',
  ebookAuthor: 'Autrice',
  chapterIndex: 0,
  chapterTitle: 'Un',
  excerpt: 'Premier paragraphe.',
  note: 'Une remarque.',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('EPUBs (L20b2b32)', () => {
  it('ne remet pas le lecteur en haut du chapitre au montage (StrictMode)', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    render(
      <React.StrictMode>
        <EbookReader book={book} />
      </React.StrictMode>
    );

    // La reprise au paragraphe mémorisé ne doit pas être annulée par un
    // « premier rendu » recalculé à chaque double invocation des effets.
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("n'immobilise pas la liseuse quand l'emport hors-ligne rejette", async () => {
    mockSdk.getEbookOfflinePackAction.mockRejectedValue(new Error('Go 502'));
    mockSdk.setEbookProgressAction.mockResolvedValue({ ok: true });

    render(<EbookReader book={book} plus />);

    const button = screen.getByTitle(
      'Emporter ce livre (lisible sans réseau)'
    ) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => expect(mockSdk.getEbookOfflinePackAction).toHaveBeenCalled());
    // `busy` doit retomber : sinon l'emport reste désactivé pour toute la session.
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("réactive l'envoi de note quand l'action rejette", async () => {
    mockSdk.addEbookNoteAction.mockRejectedValue(new Error('réseau'));

    render(
      <EbookNotes
        ebookId="eb_1"
        chapterIndex={0}
        chapterTitle="Un"
        notes={[]}
        totalCount={0}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        draftExcerpt={null}
        onDraftConsumed={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Écrire une note sur ce chapitre…'), {
      target: { value: 'Une idée' },
    });
    const submit = screen.getByText('Ajouter la note').closest('button') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => expect(mockSdk.addEbookNoteAction).toHaveBeenCalled());
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  it("n'révoque pas l'URL du blob avant que le téléchargement des notes démarre", () => {
    const createObjectURL = vi.fn(() => 'blob:qoe-notes');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));

    render(<AllNotesClient initialNotes={[note]} truncated={false} />);
    fireEvent.click(screen.getByText('Exporter (.md)'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('annonce l’échec d’une suppression de livre au lieu de la laisser filer', async () => {
    mockSdk.deleteEbookAction.mockRejectedValue(new Error('Go 503'));

    render(
      <EbooksClient
        initialEbooks={[
          {
            id: 'eb_1',
            title: 'Un livre',
            author: 'Autrice',
            language: 'fr',
            chapterCount: 2,
            hasCover: false,
            progressChapter: 0,
            progressParagraph: 0,
            progressPct: 0,
            createdAt: '2026-11-01T10:00:00.000Z',
          },
        ]}
        plus={false}
      />
    );

    fireEvent.click(screen.getByTitle('Supprimer ce livre'));
    fireEvent.click(screen.getByText('Confirmer'));

    await waitFor(() => expect(mockSdk.deleteEbookAction).toHaveBeenCalled());
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it("borne l'import d'EPUB dans le temps (pas de spinner éternel)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'eb_2', title: 'Neuf', chapterCount: 2 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<EbooksClient initialEbooks={[]} plus={false} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['PK'], 'livre.epub', { type: 'application/epub+zip' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init?.signal).toBeDefined();
  });
});
