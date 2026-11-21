// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const submitPublicTicket = vi.fn();

vi.mock('@/lib/support-actions', () => ({
  submitPublicTicket: (...args: unknown[]) => submitPublicTicket(...args),
}));

import { SupportForm } from '../support-form';

// Une action serveur peut lever (réseau coupé, redéploiement, 502 de la
// passerelle) : le formulaire doit le dire, pas rester muet en laissant le
// visiteur devant un bouton qui semble n'avoir rien fait.

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('E-mail *'), {
    target: { value: 'lecteur@exemple.fr' },
  });
  fireEvent.change(screen.getByPlaceholderText('Sujet / Subject (5 min) *'), {
    target: { value: 'Compte perdu' },
  });
  fireEvent.change(screen.getByPlaceholderText(/Décrivez le problème/), {
    target: { value: 'Je ne peux plus me connecter.' },
  });
}

describe('SupportForm — échec de l’action', () => {
  beforeEach(() => {
    submitPublicTicket.mockReset();
  });

  it('affiche un message quand l’action rejette', async () => {
    submitPublicTicket.mockRejectedValue(new Error('network down'));
    render(<SupportForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /Envoyer/ }));

    await waitFor(() => {
      expect(screen.getByText(/impossible|indisponible|réessayez/i)).toBeInTheDocument();
    });
  });

  it('affiche le message serveur quand l’action répond un refus', async () => {
    submitPublicTicket.mockResolvedValue({ ok: false, error: 'Adresse e-mail invalide' });
    render(<SupportForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /Envoyer/ }));

    await waitFor(() => {
      expect(screen.getByText('Adresse e-mail invalide')).toBeInTheDocument();
    });
  });
});
