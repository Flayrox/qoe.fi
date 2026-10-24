import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublishModal } from '../PublishModal';

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

describe('PublishModal', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    articleTitle: 'Manifeste pour une édition libre',
    articleExcerpt: 'Les nouveaux modèles de rémunération directe...',
    publicationName: 'La Revue Moderne',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien si isOpen est faux', () => {
    const { container } = render(<PublishModal {...baseProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('affiche le titre de l’article et le nom de la publication', () => {
    render(<PublishModal {...baseProps} />);
    expect(screen.getAllByText('Manifeste pour une édition libre')[0]).toBeDefined();
    expect(screen.getAllByText('La Revue Moderne')[0]).toBeDefined();
  });

  it('permet de basculer le canal de distribution (Web seul vs Web & Newsletter)', async () => {
    render(<PublishModal {...baseProps} />);
    const user = userEvent.setup();

    // Par défaut, Web & Newsletter est activé
    const webOnlyBtn = screen.getByText('Web uniquement');
    await user.click(webOnlyBtn);

    // Confirmation (le bouton passe à "Publier sur le web")
    const confirmBtn = screen.getByRole('button', { name: /Publier sur le web/i });
    await user.click(confirmBtn);

    expect(baseProps.onConfirm).toHaveBeenCalledWith({
      sendEmail: false,
      isPremium: false,
    });
  });

  it('permet de basculer en mode exclusif paywall / abonnés', async () => {
    render(<PublishModal {...baseProps} />);
    const user = userEvent.setup();

    const premiumOption = screen.getByText(/Abonnés payants \(Premium\)/i);
    await user.click(premiumOption);

    const confirmBtn = screen.getByRole('button', { name: /Publier & Envoyer maintenant/i });
    await user.click(confirmBtn);

    expect(baseProps.onConfirm).toHaveBeenCalledWith({
      sendEmail: true,
      isPremium: true,
    });
  });

  it('ne prétend pas envoyer un email de test : renvoie vers le vrai test des réglages', () => {
    render(<PublishModal {...baseProps} />);

    // Le bouton factice a disparu : plus de « Envoyé ! » sans envoi réel.
    expect(screen.queryByText('Envoyer un test')).toBeNull();
    expect(screen.queryByText('Envoyé !')).toBeNull();
    expect(screen.getByText(/Réglages → Emails & Abonnés/)).toBeDefined();
  });

  it('se ferme avec Échap et s’annonce comme une boîte de dialogue', () => {
    render(<PublishModal {...baseProps} />);

    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('ignore un second clic sur Publier pendant l’envoi', async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(<PublishModal {...baseProps} onConfirm={onConfirm} />);
    const user = userEvent.setup();

    const first = screen.getByRole('button', { name: /Publier & Envoyer maintenant/i });
    await user.click(first);
    // Le bouton est désormais désactivé : impossible de publier deux fois.
    expect((first as HTMLButtonElement).disabled).toBe(true);
    await user.click(first);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfirm();
    });
  });
});
