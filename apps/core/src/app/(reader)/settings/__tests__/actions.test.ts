// =====================================================================
// 🧪 actions de compte — validations que l'API Go ne doit pas avoir à refaire
// =====================================================================
// Mot de passe, email, username : trois écritures sensibles. Les règles
// locales sont un premier filtre (messages clairs, aucun aller-retour réseau),
// jamais un contournement du garde serveur.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  goFetch: vi.fn(),
  revalidatePath: vi.fn(),
  fetchMeProfile: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: mocks.goFetch }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/me', () => ({ fetchMeProfile: mocks.fetchMeProfile }));
vi.mock('@qoe/supabase/server', () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));

import {
  acceptFollowRequestAction,
  cancelAccountDeletionAction,
  changeEmailAction,
  changePasswordAction,
  changeUsernameAction,
  exportAccountDataAction,
  getAccountSettingsAction,
  requestAccountDeletionAction,
  toggleMutedWordAction,
  updateAccountProfileAction,
  updateAccountSettingsAction,
} from '../actions';

describe('actions de compte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.goFetch.mockResolvedValue({});
  });

  describe('changePasswordAction', () => {
    it('refuse un mot de passe trop court sans appeler le serveur', async () => {
      await expect(changePasswordAction('ancien', 'Court1')).rejects.toThrow(
        'au moins 12 caractères'
      );
      expect(mocks.goFetch).not.toHaveBeenCalled();
    });

    it('refuse un mot de passe sans mélange de classes', async () => {
      await expect(changePasswordAction('ancien', 'motdepasseuniquement')).rejects.toThrow(
        'majuscules, minuscules et chiffres'
      );
      await expect(changePasswordAction('ancien', 'MOTDEPASSEUNIQUEMENT1')).rejects.toThrow(
        'majuscules, minuscules et chiffres'
      );
      expect(mocks.goFetch).not.toHaveBeenCalled();
    });

    it('transmet le changement au Go (seul à pouvoir vérifier l’ancien mot de passe)', async () => {
      const res = await changePasswordAction('ancien-Mdp-1', 'Nouveau-Mdp-2026');

      expect(res).toEqual({ success: true });
      expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/password-change', {
        method: 'POST',
        body: { currentPassword: 'ancien-Mdp-1', newPassword: 'Nouveau-Mdp-2026' },
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings');
    });
  });

  describe('changeEmailAction', () => {
    it('refuse une adresse invalide', async () => {
      await expect(changeEmailAction('mdp', 'pas une adresse')).rejects.toThrow(
        'Adresse email invalide'
      );
      await expect(changeEmailAction('mdp', 'a@b')).rejects.toThrow('Adresse email invalide');
      expect(mocks.goFetch).not.toHaveBeenCalled();
    });

    it('normalise l’adresse avant l’envoi', async () => {
      await changeEmailAction('mdp', '  Ada@Example.ORG ');

      expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/email-change', {
        method: 'POST',
        body: { currentPassword: 'mdp', newEmail: 'ada@example.org' },
      });
    });
  });

  describe('changeUsernameAction', () => {
    it('refuse une longueur hors bornes', async () => {
      await expect(changeUsernameAction('ab')).rejects.toThrow('3 à 24 caractères');
      await expect(changeUsernameAction('a'.repeat(25))).rejects.toThrow('3 à 24 caractères');
      expect(mocks.goFetch).not.toHaveBeenCalled();
    });

    it('retire l’arobase et la casse, et suit le nom canonique renvoyé par le Go', async () => {
      mocks.goFetch.mockResolvedValue({ username: 'ada_lovelace' });

      const res = await changeUsernameAction('  @Ada_Lovelace ');

      expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/profile', {
        method: 'PATCH',
        body: { username: 'ada_lovelace' },
      });
      expect(res).toEqual({ success: true, username: 'ada_lovelace' });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/ada_lovelace');
    });
  });

  it('n’accepte la demande de suppression qu’avec le mot exact', async () => {
    await expect(requestAccountDeletionAction('delete')).rejects.toThrow('DELETE');
    expect(mocks.goFetch).not.toHaveBeenCalled();

    expect(await requestAccountDeletionAction('DELETE')).toEqual({ success: true });
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/account-deletion-request', {
      method: 'POST',
      body: {},
    });
  });

  it('annule une demande de suppression existante', async () => {
    await cancelAccountDeletionAction();

    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/account-deletion-request', {
      method: 'DELETE',
    });
  });

  it('assemble les réglages depuis les cinq sources en un seul objet', async () => {
    mocks.fetchMeProfile.mockResolvedValue({
      id: 'u1',
      email: 'ada@example.org',
      name: 'Ada',
      username: 'ada',
      logoUrl: null,
      onboardingText: null,
      pronouns: 'elle',
      role: 'reader',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mocks.goFetch.mockImplementation((url: string) => {
      if (url === '/v1/settings/preferences') return Promise.resolve({ userId: 'u1' });
      if (url === '/v1/notifications/preferences')
        return Promise.resolve({ preferences: { email: true } });
      if (url === '/v1/me/account-deletion-request') return Promise.resolve(null);
      if (url === '/v1/me/muted-words') return Promise.resolve({ words: ['spoiler'] });
      return Promise.reject(new Error(`route inattendue ${url}`));
    });

    const data = await getAccountSettingsAction();

    expect(data.user.username).toBe('ada');
    expect(data.preferences).toEqual({ email: true });
    expect(data.deletionRequest).toBeNull();
    expect(data.mutedWords).toEqual(['spoiler']);
  });

  it('garde le username normalisé dans la mise à jour de profil', async () => {
    await updateAccountProfileAction({
      name: 'Ada',
      username: '  @Ada ',
      onboardingText: '',
      logoUrl: '',
      pronouns: '',
    });

    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/profile', {
      method: 'PATCH',
      body: expect.objectContaining({ username: '  @Ada ' }),
    });
    // Le profil public vit sous /[username], jamais sous /@username.
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ada');
  });

  it('rend les réglages mis à jour par le serveur', async () => {
    mocks.goFetch.mockResolvedValue({ fontScale: 1.2 });

    const res = await updateAccountSettingsAction({ fontScale: 1.2 });

    expect(res).toEqual({ success: true, settings: { fontScale: 1.2 } });
  });

  it('sérialise un export de données avec les dates en ISO', async () => {
    mocks.goFetch.mockResolvedValue({
      user: { id: 'u1' },
      createdAt: new Date('2026-05-01T10:00:00Z'),
    });

    const json = await exportAccountDataAction();

    expect(JSON.parse(json)).toEqual({ user: { id: 'u1' }, createdAt: '2026-05-01T10:00:00.000Z' });
  });

  it('échappe l’identifiant d’une demande d’abonnement', async () => {
    await acceptFollowRequestAction('req/1');

    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/follow-requests/req%2F1/accept', {
      method: 'POST',
      body: {},
    });
  });

  it('rafraîchit les réglages après une bascule de mot filtré', async () => {
    mocks.goFetch.mockResolvedValue({ muted: true, word: 'spoiler' });

    const res = await toggleMutedWordAction('spoiler');

    expect(res).toEqual({ muted: true, word: 'spoiler' });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings');
  });
});
