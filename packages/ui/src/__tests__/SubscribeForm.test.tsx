import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscribeForm } from '../SubscribeForm';

const mocks = vi.hoisted(() => ({
  subscribeToNewsletterAction: vi.fn(),
  getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
}));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? values[i] : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

vi.mock('@qoe/sdk/actions/tenant', () => ({
  subscribeToNewsletterAction: mocks.subscribeToNewsletterAction,
}));

vi.mock('@qoe/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

const dummyRecs = [
  {
    id: 'pub_rec_1',
    name: 'Partenaire 1',
    slug: 'partenaire-1',
    subdomain: 'partenaire1',
  },
];

describe('SubscribeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend le champ email et le bouton d’abonnement pour un visiteur anonyme', () => {
    render(<SubscribeForm publicationId="pub_test_1" />);
    expect(screen.getByPlaceholderText(/Votre adresse email/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /S'abonner/i })).toBeDefined();
  });

  it('affiche le message de succès après inscription en mode anonyme', async () => {
    mocks.subscribeToNewsletterAction.mockResolvedValue({ ok: true });
    render(<SubscribeForm publicationId="pub_test_1" />);

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Votre adresse email/i);
    await user.type(input, 'lecteur@test.fr');

    const submitBtn = screen.getByRole('button', { name: /S'abonner/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Vous êtes sur la liste !/i)).toBeDefined();
    });
  });

  it('ouvre la modal de recommandations si des partenaires sont configurés', async () => {
    mocks.subscribeToNewsletterAction.mockResolvedValue({ ok: true });
    render(
      <SubscribeForm publicationId="pub_test_1" recommendations={dummyRecs} authorName="Camus" />
    );

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Votre adresse email/i);
    await user.type(input, 'lecteur@test.fr');

    const submitBtn = screen.getByRole('button', { name: /S'abonner/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Partenaire 1')).toBeDefined();
    });
  });

  it('affiche une erreur explicite en cas d’échec', async () => {
    mocks.subscribeToNewsletterAction.mockResolvedValue({
      ok: false,
      error: { message: 'Adresse email non autorisée' },
    });
    render(<SubscribeForm publicationId="pub_test_1" />);

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Votre adresse email/i);
    await user.type(input, 'rejected@error.com');

    const submitBtn = screen.getByRole('button', { name: /S'abonner/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Adresse email non autorisée')).toBeDefined();
    });
  });

  it('propose l’inscription 1-clic Substack quand un utilisateur est connecté', async () => {
    mocks.subscribeToNewsletterAction.mockResolvedValue({ ok: true });
    render(<SubscribeForm publicationId="pub_test_1" userEmail="abonne@qoefi.com" />);

    // Doit afficher le bouton 1-clic avec son email
    expect(screen.getByText('abonne@qoefi.com')).toBeDefined();
    const oneClickBtn = screen.getByTitle(/S'abonner immédiatement avec abonne@qoefi.com/i);
    expect(oneClickBtn).toBeDefined();

    const user = userEvent.setup();
    await user.click(oneClickBtn);

    await waitFor(() => {
      expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledWith({
        email: 'abonne@qoefi.com',
        publicationId: 'pub_test_1',
      });
      expect(screen.getByText(/Vous êtes sur la liste !/i)).toBeDefined();
    });
  });

  it('permet de basculer sur une autre adresse email via le chevron d’options', async () => {
    render(<SubscribeForm publicationId="pub_test_1" userEmail="abonne@qoefi.com" />);

    const user = userEvent.setup();
    const chevronBtn = screen.getByLabelText(/Options d'inscription/i);
    await user.click(chevronBtn);

    const otherEmailOption = screen.getByText(/S'abonner avec une autre adresse.../i);
    await user.click(otherEmailOption);

    // Le champ de saisie apparaît
    expect(screen.getByPlaceholderText(/Votre adresse email/i)).toBeDefined();
    expect(screen.getByText(/Revenir à mon compte Qoefi/i)).toBeDefined();
  });
});
