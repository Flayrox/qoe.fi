// @vitest-environment jsdom
// =====================================================================
// 🧪 Cartes de pensée — signalement et partage
// =====================================================================
// Trois garanties : un signalement qui rejette relâche le bouton et le dit,
// rouvrir la modale ne réaffiche pas le texte du signalement précédent, et un
// presse-papier refusé n'affiche pas « Copié ».
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockReport, mockToast, mockHideReply } = vi.hoisted(() => ({
  mockReport: vi.fn(),
  mockHideReply: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@qoe/ui/toast', () => ({ toast: mockToast }));
vi.mock('@qoe/sdk/actions/feed', () => ({ reportTargetAction: mockReport }));
vi.mock('@qoe/sdk', () => ({ hideReplyAction: mockHideReply }));
vi.mock('@qoe/ui/icon-button', () => ({
  IconButton: ({
    label,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
    <button type="button" aria-label={label} {...props}>
      {children}
    </button>
  ),
}));
vi.mock('@qoe/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@qoe/ui/spinner', () => ({ Spinner: () => <span data-spinner /> }));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
    Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings),
}));
// L'UI de dialog/radio n'est pas le sujet : on garde le comportement du
// formulaire (état, soumission, fermeture) et on retire portails/animations.
vi.mock('@qoe/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
vi.mock('@qoe/ui/radio-group', () => ({
  RadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadioCard: ({ title }: { title: string }) => <p>{title}</p>,
}));
vi.mock('@qoe/ui/input', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
vi.mock('@qoe/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { ModerationReportModal } from '../ModerationReportModal';
import { HiddenReplyNotice } from '../HiddenReplyNotice';
import { ReaderToolbarProvider, useReaderToolbar } from '../ReaderToolbarContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ModerationReportModal (L20c1)', () => {
  it("relâche le bouton Signaler quand l'action rejette", async () => {
    mockReport.mockRejectedValue(new Error('réseau'));
    const onClose = vi.fn();

    render(
      <ModerationReportModal isOpen onClose={onClose} targetId="post-1" targetType="thought" />
    );

    const submit = screen.getByText('Signaler').closest('button') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => expect(mockReport).toHaveBeenCalled());
    // `submitting` hors finally : le bouton resterait désactivé à vie.
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  it("n'hérite pas du texte du signalement précédent à la réouverture", () => {
    const onClose = vi.fn();

    const { rerender } = render(
      <ModerationReportModal isOpen onClose={onClose} targetId="post-1" targetType="thought" />
    );

    fireEvent.change(screen.getByPlaceholderText('Détails complémentaires (optionnel)...'), {
      target: { value: 'détails du post 1' },
    });

    // La modale se referme puis sert pour un autre contenu.
    rerender(
      <ModerationReportModal
        isOpen={false}
        onClose={onClose}
        targetId="post-2"
        targetType="thought"
      />
    );
    rerender(
      <ModerationReportModal isOpen onClose={onClose} targetId="post-2" targetType="thought" />
    );

    const textarea = screen.getByPlaceholderText(
      'Détails complémentaires (optionnel)...'
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });
});

describe('HiddenReplyNotice (L20c1)', () => {
  it("signale l'échec au lieu de laisser le bouton sans effet", async () => {
    mockHideReply.mockResolvedValue({ ok: false, error: { message: 'Action refusée.' } });

    render(
      <HiddenReplyNotice replyId="reply-1" isHiddenByAuthor={false} isParentAuthor>
        <p>contenu de la réponse</p>
      </HiddenReplyNotice>
    );

    fireEvent.click(
      screen.getByLabelText('Masquer cette réponse pour tous les lecteurs') as HTMLButtonElement
    );

    await waitFor(() => expect(mockHideReply).toHaveBeenCalled());
    // Rien ne bouge à l'écran : sans retour, l'auteur croit avoir masqué.
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });
});

describe('ReaderToolbarContext (L20c1)', () => {
  function Probe() {
    const ctx = useReaderToolbar();
    if (!ctx) return null;
    return (
      <div>
        <button type="button" onClick={ctx.handleShare}>
          partager
        </button>
        <span data-testid="copied">{String(ctx.copied)}</span>
      </div>
    );
  }

  it("n'annonce pas « Copié » quand le presse-papier refuse", async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard refusé');
    });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(
      <ReaderToolbarProvider>
        <Probe />
      </ReaderToolbarProvider>
    );

    fireEvent.click(screen.getByText('partager'));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // Annoncer « Copié » alors que l'écriture a échoué est un mensonge à
    // l'utilisateur, et la promesse non gérée remonte en console.
    expect(screen.getByTestId('copied').textContent).toBe('false');
  });
});
