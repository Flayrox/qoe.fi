// =====================================================================
// 🧪 /admin/retention — « vide » et « illisible » ne se ressemblent plus
// =====================================================================
// Défaut mesuré (R161) : la page recevait `[]` aussi bien d'une base vide que
// d'une API en panne, et affichait « aucune politique » dans les deux cas.
// Le test appelle le composant serveur dans les deux situations et vérifie que
// seul l'échec porte un avertissement nommé.
// =====================================================================

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => ({ Database: () => null, AlertTriangle: () => null }));
vi.mock('@/lib/admin-identity', () => ({
  getAdminIdentity: vi.fn(async () => ({ userId: 'staff_1', capabilities: [] })),
  requireCapability: vi.fn(),
}));
const mockRetention = vi.hoisted(() => ({
  getAdminRetentionPolicies: vi.fn(),
  getAdminRetentionJournal: vi.fn(),
}));
vi.mock('@/lib/admin-data', () => mockRetention);
vi.mock('../RetentionConsole', () => ({
  RetentionConsole: ({ policies, journal }: { policies: unknown[]; journal: unknown[] }) => (
    <p data-testid="retention-console">
      {policies.length} politique(s), {journal.length} purge(s)
    </p>
  ),
}));

import AdminRetentionPage from '../page';

describe('page /admin/retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('n’affiche aucun avertissement quand les deux lectures aboutissent', async () => {
    mockRetention.getAdminRetentionPolicies.mockResolvedValue({ ok: true, data: [] });
    mockRetention.getAdminRetentionJournal.mockResolvedValue({ ok: true, data: [] });

    render(await AdminRetentionPage());

    expect(screen.getByTestId('retention-console')).toHaveTextContent('0 politique(s), 0 purge(s)');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('nomme la lecture impossible quand une politique n’a pas pu être lue', async () => {
    mockRetention.getAdminRetentionPolicies.mockResolvedValue({ ok: false });
    mockRetention.getAdminRetentionJournal.mockResolvedValue({ ok: true, data: [] });

    render(await AdminRetentionPage());

    expect(screen.getByRole('status')).toHaveTextContent('lecture impossible');
    expect(screen.getByRole('status')).toHaveTextContent('Les politiques de rétention');
  });

  it('nomme la lecture impossible quand le journal n’a pas pu être lu', async () => {
    mockRetention.getAdminRetentionPolicies.mockResolvedValue({ ok: true, data: [] });
    mockRetention.getAdminRetentionJournal.mockResolvedValue({ ok: false });

    render(await AdminRetentionPage());

    expect(screen.getByRole('status')).toHaveTextContent('lecture impossible');
  });
});
