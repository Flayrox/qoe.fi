// =====================================================================
// 🧪 /admin/imports/[id] — params asynchrones (régression 500)
// =====================================================================
// Next 16 passe `params` comme une Promise. Cette page était la seule à lire
// `params.id` de façon synchrone : l'id valait `undefined`, et la route
// répondait 500 au lieu d'afficher le dossier. Le test appelle directement le
// composant serveur avec une Promise (comme le fait Next) et vérifie l'id reçu.
// =====================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getImportReview } from '@/lib/admin-data';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { notFound } from 'next/navigation';

import AdminImportReviewPage from '../page';

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('lucide-react', () => ({ ArrowLeft: () => null }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/lib/admin-data', () => ({ getImportReview: vi.fn() }));
vi.mock('@/lib/admin-identity', () => ({
  getAdminIdentity: vi.fn(async () => ({
    userId: 'staff_1',
    capabilities: ['admin.imports.read'],
  })),
  requireCapability: vi.fn(),
}));
vi.mock('@/app/(admin)/admin/imports/components/import-review-client', () => ({
  ImportReviewClient: () => null,
}));

const mockReview = vi.mocked(getImportReview);

function renderPage(id: string) {
  return AdminImportReviewPage({ params: Promise.resolve({ id }) });
}

describe('page /admin/imports/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReview.mockResolvedValue({ batch: { id: 'batch_42' } } as never);
  });

  it('résout params avant de charger le dossier', async () => {
    await renderPage('batch_42');

    expect(mockReview).toHaveBeenCalledWith('batch_42');
    expect(mockReview).not.toHaveBeenCalledWith(undefined);
  });

  it('vérifie la capacité avant toute lecture', async () => {
    await renderPage('batch_42');

    expect(requireCapability).toHaveBeenCalledWith(expect.anything(), 'admin.imports.read');
    const guardOrder = vi.mocked(requireCapability).mock.invocationCallOrder[0];
    expect(guardOrder).toBeLessThan(mockReview.mock.invocationCallOrder[0]);
    expect(getAdminIdentity).toHaveBeenCalled();
  });

  it('renvoie un 404 quand le lot est introuvable', async () => {
    mockReview.mockRejectedValue(Object.assign(new Error('Go API 404'), { status: 404 }));

    await expect(renderPage('inconnu')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  // Une panne serveur (ou un réseau coupé) n'est pas un dossier inexistant :
  // la présenter comme un 404 dit au staff « ce lot n'existe pas » alors que
  // le dossier existe et que c'est la lecture qui a échoué.
  it('ne transforme pas une panne de lecture en 404', async () => {
    const boom = Object.assign(new Error('Go API 503'), { status: 503 });
    mockReview.mockRejectedValue(boom);

    await expect(renderPage('batch_42')).rejects.toBe(boom);
    expect(notFound).not.toHaveBeenCalled();
  });
});
