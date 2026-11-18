import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        publisherId: 'pub_a',
      });
      expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledWith({
        email: 'alex@test.dev',
        publisherId: 'pub_b',
      });
    });
  });

  // ⚠️ La modale était deux `<div>` posés en `fixed inset-0` : ni
  // `role="dialog"`, ni `aria-modal`, ni titre associé, ni Échap, ni piège
  // du focus. Un lecteur d'écran continuait à parcourir le blog derrière le
  // voile, et au clavier on ne pouvait rien en faire.
  it('expose une vraie boîte de dialogue nommée (F125)', () => {
    render(
      <RecommendationModal
        isOpen={true}
        onClose={vi.fn()}
        recommendations={dummyRecs}
        subscriberEmail="test@qoe.fi"
        authorName="Victor Hugo"
      />
    );

    const dialog = screen.getByRole('dialog', { name: /vous recommande/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('se ferme avec Échap (F125)', () => {
    const onClose = vi.fn();
    render(
      <RecommendationModal
        isOpen={true}
        onClose={onClose}
        recommendations={dummyRecs}
        subscriberEmail="test@qoe.fi"
      />
    );

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  // ⚠️ Chaque ligne était une `<div onClick>` avec `cursor-pointer` et un
  // badge rond purement décoratif : aucune case à cocher pour un lecteur
  // d'écran, aucun moyen de sélectionner au clavier.
  it('expose chaque publication comme une case à cocher manipulable au clavier (F126)', () => {
    render(
      <RecommendationModal
        isOpen={true}
        onClose={vi.fn()}
        recommendations={dummyRecs}
        subscriberEmail="test@qoe.fi"
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);

    const alpha = screen.getByRole('checkbox', { name: /revue alpha/i });
    expect(alpha.getAttribute('aria-checked')).toBe('true');
    expect(alpha.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(alpha, { key: ' ' });
    expect(
      screen.getByRole('checkbox', { name: /revue alpha/i }).getAttribute('aria-checked')
    ).toBe('false');
  });

  // ⚠️ La sélection est initialisée UNE fois depuis les props. Sur le même
  // composant monté (le formulaire d'abonnement le garde affiché), un second
  // abonné recevait l'ancienne liste : la confirmation abonnait son adresse
  // aux publications de la fois précédente, qui n'étaient même plus rendues.
  it('repart de la nouvelle liste quand les recommandations changent (F127)', async () => {
    mocks.subscribeToNewsletterAction.mockResolvedValue({ ok: true });

    const { rerender } = render(
      <RecommendationModal
        isOpen={true}
        onClose={vi.fn()}
        recommendations={dummyRecs}
        subscriberEmail="premier@test.dev"
      />
    );

    rerender(
      <RecommendationModal
        isOpen={false}
        onClose={vi.fn()}
        recommendations={[{ id: 'pub_c', name: 'Cahier Gamma', slug: 'gamma', subdomain: 'gamma' }]}
        subscriberEmail="second@test.dev"
      />
    );
    rerender(
      <RecommendationModal
        isOpen={true}
        onClose={vi.fn()}
        recommendations={[{ id: 'pub_c', name: 'Cahier Gamma', slug: 'gamma', subdomain: 'gamma' }]}
        subscriberEmail="second@test.dev"
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /S'abonner à 1 publication/i }));

    await waitFor(() => expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledTimes(1));
    expect(mocks.subscribeToNewsletterAction).toHaveBeenCalledWith({
      email: 'second@test.dev',
      publisherId: 'pub_c',
    });
  });
});
