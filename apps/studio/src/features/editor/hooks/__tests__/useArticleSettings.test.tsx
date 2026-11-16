// =====================================================================
// 🧪 useArticleSettings — état, garde-fous et retours arrière
// =====================================================================
// Ce hook pilote tout le panneau de paramètres d'un article : enregistrement,
// programmation, dépublication, téléchargement, transfert de publication.
// On vérifie les contrats réels (payloads envoyés), les validations locales
// (pas d'appel réseau si la date est absente/passée) et les retours arrière
// quand le serveur refuse.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const articleActions = vi.hoisted(() => ({
  bulkUpdateArticlesAction: vi.fn(),
  getArticleByIdAction: vi.fn(),
  getWorkspacesAction: vi.fn(),
  saveArticleAction: vi.fn(),
  scheduleArticleAction: vi.fn(),
  setArticleAllowDownloadAction: vi.fn(),
  transferArticleAction: vi.fn(),
  unpublishArticleAction: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));

import { useArticleSettings } from '../useArticleSettings';

const author = { id: 'u1', name: 'Ada', username: 'ada', logoUrl: null, isCertified: false };

function articleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'art-1',
    title: 'Mon article',
    content: '{"type":"doc"}',
    slug: 'mon-article',
    published: true,
    status: 'PUBLISHED',
    imageUrl: null,
    isPremium: false,
    categoryId: 'cat-1',
    authorId: 'u1',
    author,
    coAuthors: [],
    attributions: [],
    category: null,
    views: 0,
    viewsUnique: 0,
    commentsCount: 0,
    readingTime: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    publisherId: 'pub-1',
    publisher: { id: 'pub-1', name: 'Ada', slug: 'ada', type: 'PERSONAL', subdomain: 'ada' },
    scheduledAt: null,
    seoTitle: null,
    seoDescription: null,
    allowPublicAnnotations: true,
    allowComments: true,
    allowDownload: true,
    showOnPersonalProfile: true,
    ...overrides,
  } as never;
}

const personalWorkspace = {
  id: 'pub-1',
  name: 'Ada',
  slug: 'ada',
  logoUrl: null,
  type: 'PERSONAL',
};
const mediaWorkspace = {
  id: 'pub-2',
  name: 'Revue',
  slug: 'revue',
  logoUrl: null,
  type: 'MEDIA',
};

async function mountHook(onSaved?: () => void) {
  const rendered = renderHook(() => useArticleSettings({ articleId: 'art-1', onSaved }));
  await waitFor(() => expect(rendered.result.current.loadState).not.toBe('loading'));
  return rendered;
}

describe('useArticleSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleActions.getArticleByIdAction.mockResolvedValue({ ok: true, data: articleFixture() });
    articleActions.getWorkspacesAction.mockResolvedValue({
      ok: true,
      data: { personal: personalWorkspace, medias: [mediaWorkspace] },
    });
    articleActions.saveArticleAction.mockResolvedValue({ ok: true });
    articleActions.scheduleArticleAction.mockResolvedValue({ ok: true });
    articleActions.unpublishArticleAction.mockResolvedValue({ ok: true });
    articleActions.setArticleAllowDownloadAction.mockResolvedValue({
      ok: true,
      data: { allowDownload: false },
    });
    articleActions.bulkUpdateArticlesAction.mockResolvedValue({ ok: true, data: { failed: [] } });
    articleActions.transferArticleAction.mockResolvedValue({
      ok: true,
      data: articleFixture({ id: 'art-2', title: 'Chez la revue' }),
    });
  });

  it('charge l’article, les espaces de publication et part propre', async () => {
    const { result } = await mountHook();

    expect(result.current.loadState).toBe('ready');
    expect(result.current.draft?.title).toBe('Mon article');
    expect(result.current.draft?.publisherName).toBe('Ada');
    expect(result.current.workspaces.map((w) => w.id)).toEqual(['pub-1', 'pub-2']);
    expect(result.current.dirty).toBe(false);
    expect(result.current.lastSavedAt).toBeNull();
  });

  it('expose l’erreur serveur quand le chargement échoue, puis sait réessayer', async () => {
    articleActions.getArticleByIdAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Accès refusé' },
    });
    const { result } = await mountHook();

    expect(result.current.loadState).toBe('error');
    expect(result.current.error).toBe('Accès refusé');
    expect(result.current.draft).toBeNull();

    articleActions.getArticleByIdAction.mockResolvedValueOnce({ ok: true, data: articleFixture() });
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.loadState).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('signale un article introuvable quand la réponse est vide', async () => {
    articleActions.getArticleByIdAction.mockResolvedValueOnce({ ok: true, data: null });
    const { result } = await mountHook();

    expect(result.current.loadState).toBe('error');
    expect(result.current.error).toBe('Article introuvable.');
  });

  it('suit les modifications puis restaure le dernier état enregistré', async () => {
    const { result } = await mountHook();

    act(() => result.current.patchDraft({ title: 'Titre modifié' }));
    expect(result.current.draft?.title).toBe('Titre modifié');
    expect(result.current.dirty).toBe(true);

    act(() => result.current.resetDraft());
    expect(result.current.draft?.title).toBe('Mon article');
    expect(result.current.dirty).toBe(false);
  });

  it('enregistre : payload complet, baseline à jour et notification au parent', async () => {
    const onSaved = vi.fn();
    const { result } = await mountHook(onSaved);

    act(() => result.current.patchDraft({ seoTitle: '  Titre SEO  ', seoDescription: '   ' }));
    let saved = false;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(true);
    const payload = articleActions.saveArticleAction.mock.calls[0][0];
    expect(payload).toMatchObject({
      id: 'art-1',
      title: 'Mon article',
      seoTitle: 'Titre SEO',
      seoDescription: null,
    });
    expect(result.current.dirty).toBe(false);
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
    expect(result.current.saving).toBe(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('un refus d’enregistrement laisse le brouillon sale et affiche l’erreur', async () => {
    articleActions.saveArticleAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Titre déjà utilisé' },
    });
    const { result } = await mountHook();
    act(() => result.current.patchDraft({ title: 'Doublon' }));

    let saved = true;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(false);
    expect(result.current.error).toBe('Titre déjà utilisé');
    expect(result.current.dirty).toBe(true);
    expect(result.current.draft?.title).toBe('Doublon');
    expect(toastMock.error).toHaveBeenCalledWith('Titre déjà utilisé');
  });

  it('refuse une programmation sans date sans appeler le serveur', async () => {
    const { result } = await mountHook();

    let ok = true;
    await act(async () => {
      ok = await result.current.schedule();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Choisissez une date de programmation.');
    expect(articleActions.scheduleArticleAction).not.toHaveBeenCalled();
  });

  it('refuse une programmation dans le passé', async () => {
    const { result } = await mountHook();
    act(() => result.current.patchDraft({ scheduleDraft: '2020-01-01T09:00' }));

    await act(async () => {
      await result.current.schedule();
    });

    expect(result.current.error).toBe('La date de programmation doit être dans le futur.');
    expect(articleActions.scheduleArticleAction).not.toHaveBeenCalled();
  });

  it('programme : statut et date appliqués, brouillon considéré enregistré', async () => {
    const { result } = await mountHook();
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const localDraft = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}T09:00`;
    act(() => result.current.patchDraft({ scheduleDraft: localDraft }));

    await act(async () => {
      await result.current.schedule();
    });

    const args = articleActions.scheduleArticleAction.mock.calls[0][0];
    expect(args.id).toBe('art-1');
    expect(new Date(args.scheduledAt).getFullYear()).toBe(future.getFullYear());
    expect(result.current.draft?.status).toBe('SCHEDULED');
    expect(result.current.draft?.published).toBe(false);
    expect(result.current.draft?.scheduledAt).toBe(args.scheduledAt);
    expect(result.current.dirty).toBe(false);
  });

  it('annule une programmation existante', async () => {
    articleActions.getArticleByIdAction.mockResolvedValue({
      ok: true,
      data: articleFixture({ scheduledAt: '2027-01-01T08:00:00.000Z', status: 'SCHEDULED' }),
    });
    const { result } = await mountHook();

    await act(async () => {
      await result.current.clearSchedule();
    });

    expect(articleActions.scheduleArticleAction).toHaveBeenCalledWith({
      id: 'art-1',
      scheduledAt: null,
    });
    expect(result.current.draft).toMatchObject({
      scheduledAt: null,
      scheduleDraft: '',
      status: 'DRAFT',
      published: false,
    });
  });

  it('dépublie puis expose l’échec sans mentir sur l’état', async () => {
    const { result } = await mountHook();

    await act(async () => {
      await result.current.unpublish();
    });
    expect(result.current.draft).toMatchObject({ published: false, status: 'DRAFT' });

    articleActions.unpublishArticleAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Article verrouillé' },
    });
    await act(async () => {
      await result.current.unpublish();
    });
    expect(result.current.error).toBe('Article verrouillé');
    expect(result.current.draft?.published).toBe(false);
  });

  it('applique la valeur de téléchargement renvoyée par le serveur, pas la demande', async () => {
    const { result } = await mountHook();

    await act(async () => {
      await result.current.toggleDownload(true);
    });

    // Le serveur a répondu `false` : c'est lui qui fait foi.
    expect(articleActions.setArticleAllowDownloadAction).toHaveBeenCalledWith({
      articleId: 'art-1',
      allowDownload: true,
    });
    expect(result.current.draft?.allowDownload).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it('revient en arrière si le changement de profil personnel est refusé', async () => {
    articleActions.bulkUpdateArticlesAction.mockResolvedValueOnce({
      ok: true,
      data: { failed: ['art-1'] },
    });
    const { result } = await mountHook();
    expect(result.current.draft?.showOnPersonalProfile).toBe(true);

    await act(async () => {
      await result.current.toggleShowOnPersonalProfile(false);
    });

    expect(result.current.draft?.showOnPersonalProfile).toBe(true);
    expect(result.current.error).toBe('Action impossible');
    expect(result.current.dirty).toBe(false);
  });

  it('transfère vers une autre publication et repart du nouvel article', async () => {
    const { result } = await mountHook();

    let ok = false;
    await act(async () => {
      ok = await result.current.transferPublisher('pub-2');
    });

    expect(ok).toBe(true);
    expect(articleActions.transferArticleAction).toHaveBeenCalledWith({
      articleId: 'art-1',
      targetPublisherId: 'pub-2',
      showOnPersonalProfile: true,
    });
    expect(result.current.draft?.id).toBe('art-2');
    expect(result.current.draft?.title).toBe('Chez la revue');
    expect(result.current.dirty).toBe(false);
  });

  it('ignore la réponse d’un chargement dépassé (double clic sur « réessayer »)', async () => {
    let resolveStale: (value: unknown) => void = () => {};
    articleActions.getArticleByIdAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStale = resolve;
      })
    );
    const { result } = renderHook(() => useArticleSettings({ articleId: 'art-1' }));
    expect(result.current.loadState).toBe('loading');

    articleActions.getArticleByIdAction.mockResolvedValueOnce({
      ok: true,
      data: articleFixture({ title: 'Version fraîche' }),
    });
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.draft?.title).toBe('Version fraîche');

    // La première requête arrive après : elle ne doit pas écraser l'état récent.
    await act(async () => {
      resolveStale({ ok: true, data: articleFixture({ title: 'Version périmée' }) });
      await Promise.resolve();
    });
    expect(result.current.draft?.title).toBe('Version fraîche');
    expect(result.current.loadState).toBe('ready');
  });
});
