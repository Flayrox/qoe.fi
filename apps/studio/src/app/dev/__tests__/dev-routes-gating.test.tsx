// =====================================================================
// 🚪 routes de développement — une seule porte, trois pages
// =====================================================================
// Les pages `/dev`, `/dev/ui-lab` et `/dev/editor-check` ne doivent pas
// décider chacune dans leur coin si elles existent : le middleware et le job
// E2E parlent du drapeau `QOE_E2E_DEV_ROUTES`, et une page qui l'ignore est
// un 404 silencieux au milieu d'une surface qu'on croyait ouverte.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => navigation.notFound(),
  redirect: (url: string) => navigation.redirect(url),
}));

// Les spécimens et le banc d'éditeur ne sont pas le sujet de ce test : seule
// la décision « cette route existe-t-elle ? » est mesurée.
vi.mock('../ui-lab/ui-lab', () => ({ UiLab: () => null }));
vi.mock('../editor-check/EditorCheckClient', () => ({ EditorCheckClient: () => null }));

import DevIndexPage from '../page';
import EditorCheckPage from '../editor-check/page';
import UiLabPage from '../ui-lab/page';

function renders(page: () => unknown): boolean {
  try {
    page();
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return false;
    throw error;
  }
}

describe('routes de développement', () => {
  beforeEach(() => {
    navigation.notFound.mockClear();
    navigation.redirect.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reste ouvertes en développement, sans drapeau', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('QOE_E2E_DEV_ROUTES', '');

    expect(renders(UiLabPage)).toBe(true);
    expect(renders(EditorCheckPage)).toBe(true);
    expect(renders(DevIndexPage)).toBe(true);
    expect(navigation.redirect).toHaveBeenCalledWith('/dev/ui-lab');
  });

  it('reste fermées en production réelle, drapeau absent', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QOE_E2E_DEV_ROUTES', '');

    expect(renders(UiLabPage)).toBe(false);
    expect(renders(EditorCheckPage)).toBe(false);
    expect(renders(DevIndexPage)).toBe(false);
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it('s’ouvre d’un seul tenant quand le build E2E porte le drapeau', () => {
    // Le job E2E sert un build de production (`next start`) et pose
    // QOE_E2E_DEV_ROUTES=1 : les trois routes doivent répondre, sinon le banc
    // d'éditeur marche et le lab rend 404 dans le même build.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QOE_E2E_DEV_ROUTES', '1');

    expect(renders(UiLabPage)).toBe(true);
    expect(renders(EditorCheckPage)).toBe(true);
    expect(renders(DevIndexPage)).toBe(true);
    expect(navigation.redirect).toHaveBeenCalledWith('/dev/ui-lab');
  });
});
