// @vitest-environment jsdom
// =====================================================================
// 🧪 PromptDialog — la saisie dit ce qu'elle attend, et n'envoie pas du vide
// =====================================================================
// Le défaut mesuré (R154) : `window.prompt` puis `window.confirm` pour nommer
// une vue, `window.prompt` pour la raison d'un bannissement. Aucun libellé
// associé, pas de multiligne, et une chaîne d'espaces acceptée comme nom.
// =====================================================================

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PromptDialog, type PromptRequest } from '../prompt-dialog';

function request(overrides: Partial<PromptRequest> = {}): PromptRequest {
  return {
    title: 'Enregistrer la vue',
    description: 'Les filtres affichés seront enregistrés sous ce nom.',
    label: 'Nom de la vue',
    confirmLabel: 'Enregistrer',
    required: true,
    onSubmit: () => {},
    ...overrides,
  };
}

describe('PromptDialog', () => {
  it('n’affiche rien sans demande', () => {
    render(<PromptDialog request={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('nomme le champ et refuse une saisie vide', () => {
    render(<PromptDialog request={request()} onClose={() => {}} />);

    const field = screen.getByLabelText('Nom de la vue');
    const submit = screen.getByRole('button', { name: 'Enregistrer' });
    expect(submit).toBeDisabled();

    fireEvent.change(field, { target: { value: '   ' } });
    expect(submit).toBeDisabled();

    fireEvent.change(field, { target: { value: 'Urgences' } });
    expect(submit).toBeEnabled();
  });

  it('rend la valeur rognée et l’état de la case', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <PromptDialog
        request={request({
          checkbox: { label: 'Partager avec l’équipe', defaultChecked: false },
          onSubmit,
        })}
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getByLabelText('Nom de la vue'), {
      target: { value: '  Urgences  ' },
    });
    fireEvent.click(screen.getByLabelText('Partager avec l’équipe'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(onSubmit).toHaveBeenCalledWith('Urgences', true);
    expect(onClose).toHaveBeenCalled();
  });

  it('réinitialise la saisie quand la demande change', () => {
    const { rerender } = render(
      <PromptDialog request={request({ defaultValue: 'Vue A' })} onClose={() => {}} />
    );
    expect(screen.getByLabelText('Nom de la vue')).toHaveValue('Vue A');

    rerender(
      <PromptDialog
        request={request({ title: 'Bannir le compte', label: 'Raison', defaultValue: '' })}
        onClose={() => {}}
      />
    );

    expect(screen.getByLabelText('Raison')).toHaveValue('');
    expect(screen.queryByDisplayValue('Vue A')).toBeNull();
  });
});
