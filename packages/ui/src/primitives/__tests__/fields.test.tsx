import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FieldError } from '../field/field-error';
import { Input, InputGroup } from '../input/input';

describe('Input', () => {
  it('utilise la densité du contrat, pas la taille native', () => {
    const { rerender } = render(<Input placeholder="Nom" />);
    expect(screen.getByPlaceholderText('Nom').className).toContain('h-control-md');

    rerender(<Input placeholder="Nom" size="sm" />);
    expect(screen.getByPlaceholderText('Nom').className).toContain('h-control-sm');
  });

  it('pose aria-invalid et l’anneau destructif quand le champ est en erreur', () => {
    render(<Input placeholder="Email" invalid />);
    const input = screen.getByPlaceholderText('Email');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.className).toContain('aria-invalid:border-destructive');
  });

  it('reste pilotable comme un input natif', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Input aria-label="Recherche" onChange={onChange} />);
    await user.type(screen.getByLabelText('Recherche'), 'abc');

    expect(onChange).toHaveBeenCalled();
    expect((screen.getByLabelText('Recherche') as HTMLInputElement).value).toBe('abc');
  });
});

describe('FieldError', () => {
  it('ne rend rien sans message (pas d’alerte vide annoncée)', () => {
    const { container } = render(<FieldError />);
    expect(container.innerHTML).toBe('');
  });

  it('s’annonce et se rattache au champ par son id', () => {
    render(
      <div>
        <Input aria-label="Email" aria-describedby="email-error" invalid />
        <FieldError id="email-error">Adresse invalide</FieldError>
      </div>
    );

    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('Adresse invalide');
    expect(error.getAttribute('id')).toBe('email-error');
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe('email-error');
  });
});

describe('InputGroup', () => {
  it('expose les éléments satellites sans voler le focus du champ', async () => {
    const user = userEvent.setup();

    render(
      <InputGroup left={<span aria-hidden>€</span>} right={<button type="button">Effacer</button>}>
        <Input aria-label="Montant" />
      </InputGroup>
    );

    await user.type(screen.getByLabelText('Montant'), '42');
    expect((screen.getByLabelText('Montant') as HTMLInputElement).value).toBe('42');
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeTruthy();
  });

  it('hérite de l’état invalide du groupe jusqu’au champ', () => {
    render(
      <InputGroup invalid>
        <Input aria-label="Montant" />
      </InputGroup>
    );

    // Sinon le cadre est rouge mais le champ reste annoncé valide :
    // l'erreur n'existe que pour les voyants.
    expect(screen.getByLabelText('Montant').getAttribute('aria-invalid')).toBe('true');
  });

  it('transmet l’état invalide au cadre', () => {
    const { container } = render(
      <InputGroup invalid>
        <Input aria-label="Montant" />
      </InputGroup>
    );

    expect(container.firstElementChild?.className).toContain('border-destructive');
  });
});
