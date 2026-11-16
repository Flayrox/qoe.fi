// =====================================================================
// 🧪 actions média — contrats de l'API Go vus depuis le Studio
// =====================================================================
// Ces actions sont le seul chemin d'écriture du studio média. Trois règles
// vérifiées ici : rien n'est appelé sans session, un refus du garde conserve
// son `code` (pour proposer la vérification forte), et les réponses
// partielles du serveur ne produisent jamais `undefined` à l'écran.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  goFetch: vi.fn(),
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
  consoleError: vi.fn(),
}));

vi.mock('@qoe/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: mocks.goFetch,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  acceptMediaInviteAction,
  createMediaAction,
  createMediaApiKeyAction,
  createMediaInviteLinkAction,
  getMediaByIdAction,
  getMediaInviteLinkPreviewAction,
  getUserWorkspacesAction,
  inviteMediaMemberAction,
  listMediaApiKeysAction,
  listMediaAuditLogAction,
  listPendingMediaInvitesAction,
  removeMediaMemberAction,
  updateMediaMemberPermissionsAction,
  updateMediaSettingsAction,
} from '../actions';

const mediaPublisher = {
  id: 'pub_1',
  name: 'Le Média',
  slug: 'lemedia',
  subdomain: 'lemedia',
  customDomain: null,
  bio: null,
  logoUrl: null,
  heroText: null,
  headerImageUrl: null,
  footerText: null,
  accentColor: null,
  themeMode: null,
  layoutStyle: null,
  seoTitle: null,
  seoDescription: null,
  allowIndexing: true,
  supportUrl: null,
  fontFamily: null,
  _count: { articles: 7 },
};

describe('actions média', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u_1' } } });
    mocks.goFetch.mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(mocks.consoleError);
  });

  it('refuse toute écriture sans session, sans toucher à l’API', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const res = await createMediaAction('Nouveau', 'nouveau');

    expect(res).toMatchObject({ success: false, error: 'Non authentifié' });
    expect(mocks.goFetch).not.toHaveBeenCalled();
  });

  it('crée un média avec des champs optionnels vides plutôt qu’absents', async () => {
    mocks.goFetch.mockResolvedValue({ id: 'media_1', publisherId: 'pub_1' });

    const res = await createMediaAction('Nouveau', 'nouveau');

    expect(res).toMatchObject({ success: true, media: { id: 'media_1' } });
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/media', {
      method: 'POST',
      body: { name: 'Nouveau', slug: 'nouveau', bio: '', logoUrl: '' },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('conserve le code du refus (vérification forte) pour que l’UI propose le parcours', async () => {
    mocks.goFetch.mockRejectedValue(
      Object.assign(new Error('Vérification renforcée requise'), { code: 'needs_step_up' })
    );

    const res = await inviteMediaMemberAction('media_1', 'ada');

    expect(res).toMatchObject({
      success: false,
      error: 'Vérification renforcée requise',
      code: 'needs_step_up',
    });
  });

  it('remonte les espaces de travail (personnel + médias)', async () => {
    const personal = { id: 'p', name: 'Ada', slug: 'ada', logoUrl: null, type: 'PERSONAL' };
    mocks.goFetch.mockResolvedValue({ personal, medias: [] });

    const res = await getUserWorkspacesAction();

    expect(res).toEqual({ success: true, personal, medias: [] });
  });

  it('expose le nombre d’articles et les droits réels d’un média', async () => {
    mocks.goFetch.mockResolvedValue({
      media: { id: 'media_1', publisher: mediaPublisher, members: [] },
      myRole: 'owner',
    });

    const res = await getMediaByIdAction('media_1');

    expect(res).toMatchObject({
      success: true,
      articlesCount: 7,
      myRole: 'owner',
      canManageApiKeys: false,
      canViewAudit: false,
    });
  });

  it('ne met pas les catégories « all » ni les valeurs vides dans la requête d’audit', async () => {
    mocks.goFetch.mockResolvedValue({ entries: null, total: 0 });

    const res = await listMediaAuditLogAction('media_1', { category: 'all', limit: 20 });

    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/media/media_1/audit?limit=20');
    expect(res).toMatchObject({ success: true, entries: [], total: 0, limit: 20, offset: 0 });
  });

  it('ajoute la recherche et la catégorie quand elles sont utiles', async () => {
    mocks.goFetch.mockResolvedValue({ entries: [], total: 0 });

    await listMediaAuditLogAction('media_1', { category: 'members', query: 'ada' });

    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/media/media_1/audit?category=members&q=ada');
  });

  it('signale une invitation déjà acceptée sans la confondre avec un échec', async () => {
    mocks.goFetch.mockResolvedValue({ success: true, alreadyMember: true });

    const res = await inviteMediaMemberAction('media_1', 'ada', 'editor');

    expect(res).toEqual({ success: true, alreadyMember: true });
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/media/media_1/invites', {
      method: 'POST',
      body: { username: 'ada', role: 'editor' },
    });
  });

  it('rend une liste vide si le serveur ne renvoie pas de clés API', async () => {
    mocks.goFetch.mockResolvedValue({});

    const res = await listMediaApiKeysAction('media_1');

    expect(res).toEqual({ success: true, keys: undefined });
  });

  it('propage l’erreur de listing des clés API', async () => {
    mocks.goFetch.mockRejectedValue(new Error('Preuve forte expirée'));

    const res = await listMediaApiKeysAction('media_1');

    expect(res).toEqual({ success: false, error: 'Preuve forte expirée' });
  });

  it('crée un lien d’invitation avec les valeurs par défaut (24 h, 1 usage)', async () => {
    mocks.goFetch.mockResolvedValue({ success: true, link: { id: 'link_1' } });

    const res = await createMediaInviteLinkAction('media_1');

    expect(res).toEqual({ success: true, link: { id: 'link_1' } });
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/media/media_1/links', {
      method: 'POST',
      body: { role: 'writer', expiresInHours: 24, maxUses: 1 },
    });
  });

  it('lit l’aperçu d’un lien sans exiger de session (page publique)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.goFetch.mockResolvedValue({ name: 'Le Média', isValid: true });

    const res = await getMediaInviteLinkPreviewAction('tok en');

    expect(res).toMatchObject({ success: true, preview: { isValid: true } });
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/media/invites/link/tok%20en');
  });

  it('échappe les identifiants dans les chemins d’écriture', async () => {
    await updateMediaMemberPermissionsAction('media/1', 'user 2', ['manage_members']);
    await removeMediaMemberAction('media/1', 'user 2');
    await updateMediaSettingsAction('media/1', { name: 'Nouveau nom' });

    expect(mocks.goFetch).toHaveBeenNthCalledWith(
      1,
      '/v1/media/media%2F1/members/user%202/permissions',
      { method: 'PATCH', body: { permissions: ['manage_members'] } }
    );
    expect(mocks.goFetch).toHaveBeenNthCalledWith(2, '/v1/media/media%2F1/members/user%202', {
      method: 'DELETE',
    });
    expect(mocks.goFetch).toHaveBeenNthCalledWith(3, '/v1/media/media%2F1/settings', {
      method: 'PATCH',
      body: { name: 'Nouveau nom' },
    });
  });

  it('accepte une invitation et remonte le rôle accordé', async () => {
    mocks.goFetch.mockResolvedValue({ success: true, role: 'writer' });

    const res = await acceptMediaInviteAction('media_1');

    expect(res).toEqual({ success: true, role: 'writer' });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/media');
  });

  it('rend des invitations vides quand l’API ne renvoie rien', async () => {
    mocks.goFetch.mockResolvedValue({});

    const res = await listPendingMediaInvitesAction();

    expect(res).toEqual({ success: true, items: [] });
  });

  it('remonte une erreur de création de clé API sans perdre le message serveur', async () => {
    mocks.goFetch.mockRejectedValue(new Error('Quota de clés atteint'));

    const res = await createMediaApiKeyAction('media_1', 'CI', ['articles:read']);

    expect(res).toEqual({ success: false, error: 'Quota de clés atteint' });
  });
});
