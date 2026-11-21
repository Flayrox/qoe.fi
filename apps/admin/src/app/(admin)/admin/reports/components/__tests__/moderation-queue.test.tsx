// @vitest-environment jsdom
// =====================================================================
// 🧪 ModerationQueue — décision de modération, sans perdre la ligne
// =====================================================================
// La file est le seul écran où un signalement se clôt. Deux garanties :
// une action réussie met la ligne à jour et l'annonce (statut audité),
// une action refusée ne touche à rien et explique le refus. La sanction
// lourde (suspension) exige un motif écrit.
// =====================================================================

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const resolveSpy = vi.fn();
const notifyFailure = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@qoe/sdk/actions/admin', () => ({
  resolveModerationReportAction: (input: unknown) => resolveSpy(input),
}));

vi.mock('@/lib/authz-feedback', () => ({
  attemptWithStepUp: (run: () => Promise<unknown>) => run(),
  notifyActionFailure: (result: unknown, fallback: string) => notifyFailure(result, fallback),
  readMessage: (source: unknown) =>
    (source as { error?: { message?: string } } | null)?.error?.message ?? null,
}));

import { ModerationQueue } from '../moderation-queue';
import type { ModerationReportItem } from '@/lib/admin-data';

function report(overrides: Partial<ModerationReportItem> = {}): ModerationReportItem {
  return {
    id: 'rep_0000000001',
    targetId: 'tht_0000000042',
    targetType: 'thought',
    reason: 'spam',
    details: null,
    status: 'pending',
    actionTaken: 'none',
    createdAt: '2026-11-16T10:00:00.000Z',
    targetPreview: 'Achetez des followers ici',
    targetCount: 2,
    reporter: { id: 'usr_1', name: 'Ada', username: 'ada', logoUrl: null },
    ...overrides,
  };
}

function openFirstReport() {
  fireEvent.click(screen.getAllByLabelText('Actions de la ligne')[0]);
  fireEvent.click(screen.getByRole('menuitem', { name: /Aperçu du dossier/i }));
}

describe('ModerationQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSpy.mockResolvedValue({ ok: true, data: { success: true } });
  });

  it('affiche les signalements et leurs libellés lisibles', () => {
    render(<ModerationQueue initialItems={[report()]} />);

    expect(screen.getByLabelText('File des signalements de modération')).toBeDefined();
    expect(screen.getByText('Achetez des followers ici')).toBeDefined();
    // « Spam / pub » et « En attente » servent aussi de facettes : on vérifie
    // qu'ils apparaissent au moins une fois dans la grille.
    expect(screen.getAllByText('Spam / pub').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En attente').length).toBeGreaterThan(0);
    expect(screen.getByText('+1')).toBeDefined();
  });

  it('résout un signalement, met la ligne à jour et l’annonce comme auditée', async () => {
    render(<ModerationQueue initialItems={[report()]} />);
    openFirstReport();

    fireEvent.click(screen.getByRole('button', { name: /Résoudre \(conforme\)/i }));

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith({
        reportId: 'rep_0000000001',
        action: 'resolve',
        note: '',
      });
    });
    // Le tiroir de détail est modal : la grille passe en `aria-hidden`, d'où
    // `hidden: true` pour lire le bandeau de statut resté derrière.
    const status = await screen.findByRole('status', { hidden: true });
    expect(status.textContent).toMatch(/Résolu sans action · audité à/);
    expect(notifyFailure).not.toHaveBeenCalled();
    expect(screen.getAllByText('Résolu').length).toBeGreaterThan(0);
  });

  it('n’applique rien et explique le refus quand l’action échoue', async () => {
    resolveSpy.mockResolvedValue({ ok: false, error: { code: 'FORBIDDEN', message: 'Refusé' } });
    render(<ModerationQueue initialItems={[report()]} />);
    openFirstReport();

    fireEvent.click(screen.getByRole('button', { name: /Résoudre \(conforme\)/i }));

    await waitFor(() => expect(notifyFailure).toHaveBeenCalled());
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
    // La ligne reste en attente : aucun statut n'a été inventé localement.
    expect(screen.getAllByText('En attente').length).toBeGreaterThan(0);
  });

  it('exige un motif écrit avant de suspendre l’auteur', async () => {
    render(<ModerationQueue initialItems={[report()]} />);
    openFirstReport();

    const suspend = screen.getByRole('button', { name: /^Suspendre$/i }) as HTMLButtonElement;
    expect(suspend.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Motif de suspension obligatoire/i), {
      target: { value: 'Réitère après deux avertissements' },
    });
    await waitFor(() => expect(suspend.disabled).toBe(false));

    fireEvent.click(suspend);

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith({
        reportId: 'rep_0000000001',
        action: 'suspend_author',
        note: 'Réitère après deux avertissements',
      });
    });
  });
});
