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

  it('déclenche l’envoi d’un email test', () => {
    vi.useFakeTimers();
    render(<PublishModal {...baseProps} />);

    const testEmailBtn = screen.getByText('Envoyer un test');
    act(() => {
      fireEvent.click(testEmailBtn);
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText('Envoyé !')).toBeDefined();
    vi.useRealTimers();
  });
});
