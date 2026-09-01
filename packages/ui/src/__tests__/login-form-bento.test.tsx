// @vitest-environment jsdom
// =====================================================================
// 🧪 LoginFormBento — Signup lecteur one-click (formulaire unique)
// =====================================================================
// Vérifie que l'inscription est un formulaire unique (plus de parcours en
// 3 étapes) : les 4 champs sont visibles d'un coup, la démographie est
// repliée par défaut, la validation est unifiée au submit et le payload
// supabase est correct (démographie omise tant qu'elle n'est pas remplie).
// =====================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { LoginFormBento } from '../LoginFormBento';

vi.mock('@lingui/core/macro', () => ({
  t: (str: unknown) => (Array.isArray(str) ? str[0] : String(str || '')),
}));

const mockSignUp = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock('@qoe/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signUp: mockSignUp,
      signInWithOtp: mockSignInWithOtp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  })),
}));

const getForm = (container: HTMLElement) => container.querySelector('form') as HTMLFormElement;

const setInput = (container: HTMLElement, name: string, value: string) => {
  const input = container.querySelector(`input[name="${name}"]`) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
};

const fillRequired = (container: HTMLElement) => {
  setInput(container, 'name', 'Marc Dutronc');
  setInput(container, 'username', 'marcdutronc');
  setInput(container, 'email', 'reader@exemple.com');
  setInput(container, 'password', 'longpassword1');
};

// La redirection window.location.href = '/onboarding' post-signup émet un
// « Not implemented: navigation » dans jsdom : on le silencie pour les
// tests de parcours complet.
const silenceJsdomNavigation = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('LoginFormBento — signup one-click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({ error: null });
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it("1. affiche un formulaire unique : 4 champs, un seul bouton « S'inscrire », aucune étape", () => {
    const { container } = render(<LoginFormBento initialMode="signup" />);

    expect(container.querySelector('input[name="name"]')).toBeTruthy();
    expect(container.querySelector('input[name="username"]')).toBeTruthy();
    expect(container.querySelector('input[name="email"]')).toBeTruthy();
    expect(container.querySelector('input[name="password"]')).toBeTruthy();

    const submitButtons = [...container.querySelectorAll('button[type="submit"]')];
    expect(submitButtons).toHaveLength(1);
    expect(submitButtons[0].textContent).toContain("S'inscrire");

    // Plus de navigation par étapes (points interactifs, bouton Continuer).
    expect(container.querySelector('button[aria-label="Étape 1"]')).toBeNull();
    const hasContinue = [...container.querySelectorAll('button')].some((b) =>
      /continuer/i.test(b.textContent || '')
    );
    expect(hasContinue).toBe(false);
  });

  it('2. affiche le titre et le sous-titre one-click du signup', () => {
    const { getByText } = render(<LoginFormBento initialMode="signup" />);
    expect(getByText('Créer un compte')).toBeTruthy();
    expect(
      getByText('Rejoignez le réseau souverain — un seul formulaire, quelques secondes')
    ).toBeTruthy();
  });

  it('3. la démographie est repliée par défaut et se déplie/replie au clic', () => {
    const { container, getByText } = render(<LoginFormBento initialMode="signup" />);

    expect(getByText('Votre profil (optionnel)')).toBeTruthy();
    expect(container.textContent).not.toContain("Qu'est-ce qui vous décrit le mieux ?");

    fireEvent.click(getByText('Votre profil (optionnel)'));
    expect(container.textContent).toContain("Qu'est-ce qui vous décrit le mieux ?");
    expect(container.textContent).toContain("Votre tranche d'âge");
    expect(container.querySelector('input[name="pronouns"]')).toBeTruthy();

    fireEvent.click(getByText('Votre profil (optionnel)'));
    expect(container.textContent).not.toContain("Qu'est-ce qui vous décrit le mieux ?");
  });

  it('4. valide le nom et le username avant tout appel supabase', () => {
    const { container } = render(<LoginFormBento initialMode="signup" />);
    setInput(container, 'email', 'reader@exemple.com');
    setInput(container, 'password', 'longpassword1');
    fireEvent.submit(getForm(container));

    expect(container.textContent).toContain("Veuillez renseigner votre nom et nom d'utilisateur.");
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('5. valide le format de l’adresse email', () => {
    const { container } = render(<LoginFormBento initialMode="signup" />);
    fillRequired(container);
    setInput(container, 'email', 'pas-un-email');
    fireEvent.submit(getForm(container));

    expect(container.textContent).toContain('Veuillez renseigner une adresse email valide.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('6. valide la longueur minimale du mot de passe', () => {
    const { container } = render(<LoginFormBento initialMode="signup" />);
    fillRequired(container);
    setInput(container, 'password', 'court');
    fireEvent.submit(getForm(container));

    expect(container.textContent).toContain(
      'Votre mot de passe doit contenir au moins 8 caractères.'
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('7. soumet signUp avec les champs obligatoires, démographie omise', async () => {
    const stop = silenceJsdomNavigation();
    const { container } = render(<LoginFormBento initialMode="signup" />);
    fillRequired(container);
    fireEvent.submit(getForm(container));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'reader@exemple.com',
        password: 'longpassword1',
        options: expect.objectContaining({
          data: expect.objectContaining({
            name: 'Marc Dutronc',
            username: 'marcdutronc',
            gender: undefined,
            ageRange: undefined,
            pronouns: undefined,
          }),
        }),
      })
    );
    stop.mockRestore();
  });

  it('8. envoie la démographie choisie dans le payload supabase', async () => {
    const stop = silenceJsdomNavigation();
    const { container, getByText } = render(<LoginFormBento initialMode="signup" />);
    fillRequired(container);

    fireEvent.click(getByText('Votre profil (optionnel)'));
    fireEvent.click(getByText('Femme'));
    fireEvent.click(getByText('25-34 ans'));
    setInput(container, 'pronouns', 'iel');
    fireEvent.submit(getForm(container));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({
            gender: 'FEMALE',
            ageRange: 'AGE_25_34',
            pronouns: 'iel',
          }),
        }),
      })
    );
    stop.mockRestore();
  });

  it("9. masque le lien « S'inscrire » quand ALLOW_NEW_REGISTRATIONS=false", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        ALLOW_NEW_REGISTRATIONS: 'false',
        AUTH_METHODS: JSON.stringify({
          google: false,
          apple: false,
          password: true,
          magicLink: true,
        }),
      }),
    } as unknown as Response);
    const { queryByText } = render(<LoginFormBento />);

    await waitFor(() => {
      expect(queryByText("Pas encore de compte ? S'inscrire")).toBeNull();
    });
  });

  it('10. replie un signup déjà ouvert vers la connexion quand les inscriptions ferment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        ALLOW_NEW_REGISTRATIONS: 'false',
        AUTH_METHODS: JSON.stringify({
          google: false,
          apple: false,
          password: true,
          magicLink: true,
        }),
      }),
    } as unknown as Response);
    const { queryByText } = render(<LoginFormBento initialMode="signup" />);

    // Le signup est d'abord rendu, puis replié une fois la config chargée.
    await waitFor(() => {
      expect(queryByText('Créer un compte')).toBeNull();
    });
  });
});
