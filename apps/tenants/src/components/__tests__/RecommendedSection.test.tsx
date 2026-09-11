import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendedSection } from '../RecommendedSection';

const mocks = vi.hoisted(() => ({
  subscribeToNewsletterAction: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/tenant', () => ({
  subscribeToNewsletterAction: mocks.subscribeToNewsletterAction,
}));

const dummyRecommendations = [
  {
    id: 'pub_partner_1',
    name: 'Tech Horizon',
    slug: 'tech-horizon',
    subdomain: 'tech',
    customDomain: null,
    description: 'Veille technologique de pointe',
    logoUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=120',
    articlesCount: 42,
    subscribersCount: 1200,
    authorName: 'Sarah Connor',
    authorAvatarUrl: null,
  },
  {
    id: 'pub_partner_2',
    name: 'Design Digest',
    slug: 'design-digest',
    subdomain: 'design',
    customDomain: 'design.org',
    description: 'Inspirations et typographies',
    logoUrl: null,
    articlesCount: 15,
    subscribersCount: 340,
    authorName: 'Alex Smith',
    authorAvatarUrl: null,
  },
];

describe('RecommendedSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien si la liste de recommandations est vide', () => {
    const { container } = render(<RecommendedSection recommendations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('rend les publications recommandées avec leurs titres et descriptions', () => {
    render(<RecommendedSection authorName="Jean Auteur" recommendations={dummyRecommendations} />);

    expect(screen.getByText('Tech Horizon')).toBeInTheDocument();
    expect(screen.getByText('Veille technologique de pointe')).toBeInTheDocument();
    expect(screen.getByText('Design Digest')).toBeInTheDocument();
    expect(screen.getByText('Inspirations et typographies')).toBeInTheDocument();
  });

  it('ouvre la modal d’abonnement 1-clic et traite l’inscription', async () => {
    mocks.subscribeToNewsletterAction.mockResolvedValue({ ok: true });
    render(<RecommendedSection recommendations={dummyRecommendations} />);

    const user = userEvent.setup();
    const subscribeButtons = screen.getAllByRole('button', { name: /S'abonner/i });
    await user.click(subscribeButtons[0]);

    // La modal s'ouvre
    expect(screen.getByPlaceholderText(/Votre adresse email/i)).toBeInTheDocument();

    // Saisie de l'email
    const input = screen.getByPlaceholderText(/Votre adresse email/i);
    await user.type(input, 'test@subscriber.dev');

    // Validation
    const confirmButton = screen.getByRole('button', { name: /Confirmer l'abonnement/i });
    await user.click(confirmButton);

    expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledWith({
      email: 'test@subscriber.dev',
      publicationId: 'pub_partner_1',
    });
  });
});
