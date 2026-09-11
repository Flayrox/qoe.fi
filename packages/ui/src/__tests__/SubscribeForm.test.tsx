import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscribeForm } from '../SubscribeForm';

const mocks = vi.hoisted(() => ({
  subscribeToNewsletterAction: vi.fn(),
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

  it('rend le champ email et le bouton d’abonnement', () => {
    render(<SubscribeForm publicationId="pub_test_1" />);
    expect(screen.getByPlaceholderText(/Votre adresse email/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /S'abonner/i })).toBeDefined();
  });

  it('affiche le message de succès après inscription', async () => {
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
});
