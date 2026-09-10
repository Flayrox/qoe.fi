import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  createClient: vi.fn(),
  fetchMeProfile: vi.fn(),
  logoutAction: vi.fn(),
  getCurrentUserAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@qoe/supabase/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/me', () => ({
  fetchMeProfile: mocks.fetchMeProfile,
}));

vi.mock('@qoe/sdk/actions/auth', () => ({
  logoutAction: mocks.logoutAction,
  getCurrentUserAction: mocks.getCurrentUserAction,
}));

import { login, signup, logout, getCurrentUser } from '../actions';

describe('apps/core login & signup server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('redirects with error when credentials are missing', async () => {
      const formData = new FormData();
      formData.set('email', '');
      formData.set('password', '');

      await expect(login(formData)).rejects.toThrow('REDIRECT:/login?error=Missing+credentials');
    });

    it('redirects with error when Supabase signIn fails', async () => {
      const formData = new FormData();
      formData.set('email', 'alice@qoe.fi');
      formData.set('password', 'secret');

      mocks.createClient.mockResolvedValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid login credentials' },
          }),
        },
      });

      await expect(login(formData)).rejects.toThrow(
        'REDIRECT:/login?error=Invalid%20login%20credentials'
      );
    });

    it('redirects to /onboarding for a user with 0 follows and 0 muted words', async () => {
      const formData = new FormData();
      formData.set('email', 'newuser@qoe.fi');
      formData.set('password', 'secret123');

      mocks.createClient.mockResolvedValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr_new' } },
            error: null,
          }),
        },
      });

      mocks.fetchMeProfile.mockResolvedValue({
        id: 'usr_new',
        role: 'user',
        followsCount: 0,
        mutedWordsCount: 0,
      });

      await expect(login(formData)).rejects.toThrow('REDIRECT:/onboarding');
    });

    it('redirects to target or /home when user is already active', async () => {
      const formData = new FormData();
      formData.set('email', 'active@qoe.fi');
      formData.set('password', 'secret123');
      formData.set('redirect', '/library');

      mocks.createClient.mockResolvedValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr_active' } },
            error: null,
          }),
        },
      });

      mocks.fetchMeProfile.mockResolvedValue({
        id: 'usr_active',
        role: 'user',
        followsCount: 5,
        mutedWordsCount: 1,
      });

      await expect(login(formData)).rejects.toThrow('REDIRECT:/library');
    });
  });

  describe('signup', () => {
    it('redirects with error when required fields are missing', async () => {
      const formData = new FormData();
      formData.set('email', 'test@qoe.fi');
      // missing password, name, username

      await expect(signup(formData)).rejects.toThrow('REDIRECT:/login?error=Missing+fields');
    });

    it('redirects with error when username is invalid', async () => {
      const formData = new FormData();
      formData.set('email', 'valid@example.com');
      formData.set('password', 'superpassword123');
      formData.set('name', 'Bad Username');
      formData.set('username', 'a'); // Too short

      await expect(signup(formData)).rejects.toThrow(/REDIRECT:\/login\?error=/);
    });

    it('creates user and redirects to /onboarding on success', async () => {
      const formData = new FormData();
      formData.set('email', 'valid.user@gmail.com');
      formData.set('password', 'SecurePassword123!');
      formData.set('name', 'John Doe');
      formData.set('username', 'johndoe2026');

      const signUpMock = vi.fn().mockResolvedValue({
        data: { user: { id: 'usr_created' } },
        error: null,
      });

      mocks.createClient.mockResolvedValue({
        auth: {
          signUp: signUpMock,
        },
      });

      await expect(signup(formData)).rejects.toThrow('REDIRECT:/onboarding');
      expect(signUpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'valid.user@gmail.com',
          password: 'SecurePassword123!',
          options: {
            data: expect.objectContaining({
              name: 'John Doe',
              username: 'johndoe2026',
            }),
          },
        })
      );
    });
  });

  describe('logout & getCurrentUser', () => {
    it('calls logoutAction and redirects to /login', async () => {
      mocks.logoutAction.mockResolvedValue({ ok: true });

      await expect(logout()).rejects.toThrow('REDIRECT:/login');
      expect(mocks.logoutAction).toHaveBeenCalled();
    });

    it('delegates getCurrentUser to getCurrentUserAction', async () => {
      mocks.getCurrentUserAction.mockResolvedValue({ id: 'u1', email: 'test@qoe.fi' });

      const res = await getCurrentUser();
      expect(res).toEqual({ id: 'u1', email: 'test@qoe.fi' });
      expect(mocks.getCurrentUserAction).toHaveBeenCalled();
    });
  });
});
