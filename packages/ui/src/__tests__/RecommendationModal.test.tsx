import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendationModal } from '../RecommendationModal';

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
    id: 'pub_a',
    name: 'Revue Alpha',
    slug: 'alpha',
    subdomain: 'alpha',
    description: 'Veille stratégique',
    articlesCount: 12,
  },
  {
    id: 'pub_b',
    name: 'Courrier Beta',
    slug: 'beta',
    subdomain: 'beta',
    description: 'Analyse géopolitique',
    articlesCount: 30,
  },
];

describe('RecommendationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien quand isOpen est faux', () => {
    const { container } = render(
      <RecommendationModal
        isOpen={false}
        onClose={vi.fn()}
        recommendations={dummyRecs}
        subscriberEmail="test@qoe.fi"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('rend les publications pré-sélectionnées par défaut', () => {
    render(
      <RecommendationModal
        isOpen={true}
        onClose={vi.fn()}
        recommendations={dummyRecs}
        subscriberEmail="test@qoe.fi"
        authorName="Victor Hugo"
      />
    );

    expect(screen.getByText('Revue Alpha')).toBeDefined();
    expect(screen.getByText('Courrier Beta')).toBeDefined();
    expect(screen.getByText(/S'abonner aux 2 publications/i)).toBeDefined();
  });

  it('permet de désélectionner une publication et met à jour le libellé du bouton', async () => {
    render(
      <RecommendationModal
        isOpen={true}
        onClose={vi.fn()}
        recommendations={dummyRecs}
        subscriberEmail="test@qoe.fi"
      />
    );

    const user = userEvent.setup();
    const alphaItem = screen.getByText('Revue Alpha');
    await user.click(alphaItem);

    // Il ne reste qu'1 sélection
    expect(screen.getByText(/S'abonner à 1 publication/i)).toBeDefined();
  });

  it('déclenche le multi-abonnement en parallèle lors de la confirmation', async () => {
    mocks.subscribeToNewsletterAction.mockResolvedValue({ ok: true });
    const onClose = vi.fn();

    render(
      <RecommendationModal
        isOpen={true}
        onClose={onClose}
        recommendations={dummyRecs}
        subscriberEmail="alex@test.dev"
      />
    );

    const user = userEvent.setup();
    const submitBtn = screen.getByRole('button', { name: /S'abonner aux 2 publications/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledTimes(2);
      expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledWith({
        email: 'alex@test.dev',
        publicationId: 'pub_a',
      });
      expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledWith({
        email: 'alex@test.dev',
        publicationId: 'pub_b',
      });
    });
  });
});
