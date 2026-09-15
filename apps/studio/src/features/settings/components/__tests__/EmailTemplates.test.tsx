import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailTemplates } from '../email-templates';

const mocks = vi.hoisted(() => ({
  getEmailSettingsAction: vi.fn(),
  updateEmailSettingsAction: vi.fn(),
  previewEmailSettingsAction: vi.fn(),
}));

vi.mock('../../actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../actions')>();
  return {
    ...actual,
    getEmailSettingsAction: mocks.getEmailSettingsAction,
    updateEmailSettingsAction: mocks.updateEmailSettingsAction,
    previewEmailSettingsAction: mocks.previewEmailSettingsAction,
  };
});

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

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

describe('EmailTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmailSettingsAction.mockResolvedValue({
      publicationName: 'La Gazette',
      emailSettings: { fromName: 'Léa', footerNote: 'Publié avec amour.' },
    });
    mocks.updateEmailSettingsAction.mockResolvedValue({
      emailSettings: { fromName: 'Léa', footerNote: 'Publié avec amour.' },
    });
    mocks.previewEmailSettingsAction.mockImplementation(
      (_pub: string, template: string, locale: string) =>
        Promise.resolve({
          subject: template === 'welcome' ? 'Bienvenue chez La Gazette' : 'Confirmez — La Gazette',
          from: 'Léa <noreply@qoe.fi>',
          html: `<!DOCTYPE html><html lang="${locale}"><body>rendu ${template} ${locale}</body></html>`,
          text: `rendu texte ${template} ${locale}`,
        })
    );
  });

  it('charge les réglages existants', async () => {
    render(<EmailTemplates publicationId="pub-1" />);
    await waitFor(() => {
      expect((screen.getAllByDisplayValue('Léa')[0] as HTMLInputElement).value).toBe('Léa');
    });
    expect((screen.getAllByDisplayValue('Publié avec amour.')[0] as HTMLInputElement).value).toBe(
      'Publié avec amour.'
    );
  });

  it('sauvegarde via PATCH et reflète la version assainie du backend', async () => {
    render(<EmailTemplates publicationId="pub-1" />);
    await waitFor(() => {
      expect(screen.getByText(/Enregistrer les réglages email/)).toBeDefined();
    });

    fireEvent.change(screen.getAllByDisplayValue('Léa')[0], {
      target: { value: 'Léa Martin' },
    });
    fireEvent.click(screen.getByText(/Enregistrer les réglages email/));

    await waitFor(() => {
      expect(mocks.updateEmailSettingsAction).toHaveBeenCalledWith('pub-1', {
        fromName: 'Léa Martin',
        footerNote: 'Publié avec amour.',
      });
    });
  });

  it('prévisualise avec les valeurs du brouillon (rendu backend réel)', async () => {
    render(<EmailTemplates publicationId="pub-1" />);

    await waitFor(() => {
      // Débounce 500 ms sur le brouillon par défaut (réglages chargés).
      expect(mocks.previewEmailSettingsAction).toHaveBeenCalled();
    });
    // Le brouillon = réglages chargés.
    expect(mocks.previewEmailSettingsAction).toHaveBeenCalledWith(
      'pub-1',
      'confirm',
      'fr',
      expect.objectContaining({ fromName: 'Léa' })
    );
  });

  it('bascule la langue et re-rend le sujet traduit', async () => {
    render(<EmailTemplates publicationId="pub-1" />);
    await waitFor(() => {
      expect(mocks.previewEmailSettingsAction).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    await waitFor(() => {
      expect(mocks.previewEmailSettingsAction).toHaveBeenCalledWith(
        'pub-1',
        'confirm',
        'en',
        expect.anything()
      );
    });
  });

  it('rend l’iframe d’aperçu avec le HTML du backend', async () => {
    const { container } = render(<EmailTemplates publicationId="pub-1" />);
    await waitFor(
      () => {
        const iframe = container.querySelector('iframe[title="email-preview"]');
        expect(iframe).not.toBeNull();
        expect((iframe as HTMLIFrameElement).getAttribute('srcdoc')).toContain('rendu confirm fr');
      },
      { timeout: 5000 }
    );
  });
});
