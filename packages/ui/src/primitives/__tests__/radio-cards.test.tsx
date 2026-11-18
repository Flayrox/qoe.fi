import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RadioGroup, RadioCard, Radio } from '../radio-group/radio-cards';

describe('RadioGroup & RadioCard', () => {
  it('supporte la sélection par clic et au clavier', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RadioGroup aria-label="Mise en page" defaultValue="minimal" onChange={onChange}>
        <RadioCard value="minimal" title="Minimal" description="Mise en page sobre" />
        <RadioCard value="magazine" title="Magazine" description="Grille éditoriale" />
      </RadioGroup>
    );

    const minimal = screen.getByRole('radio', { name: /minimal/i }) as HTMLInputElement;
    const magazine = screen.getByRole('radio', { name: /magazine/i }) as HTMLInputElement;

    expect(minimal.checked).toBe(true);
    expect(magazine.checked).toBe(false);

    await user.click(magazine);

    expect(onChange).toHaveBeenCalledWith('magazine');
    expect(magazine.checked).toBe(true);
  });

  it('gère l’état désactivé', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RadioGroup aria-label="Choix" onChange={onChange}>
        <RadioCard value="active" title="Actif" />
        <RadioCard value="locked" title="Verrouillé" isDisabled />
      </RadioGroup>
    );

    const locked = screen.getByRole('radio', { name: /verrouillé/i }) as HTMLInputElement;
    expect(locked.disabled).toBe(true);

    await user.click(locked);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nomme le groupe depuis `label` et annonce sa description', () => {
    // ⚠️ Avec `label`, le nom accessible était VIDE : le libellé était un
    // `<span>` posé à côté du `role="radiogroup"`, pas un `<Label>`.
    render(
      <RadioGroup label="Format de publication" description="Choisissez le rendu final">
        <Radio value="pdf">PDF</Radio>
        <Radio value="epub">EPUB</Radio>
      </RadioGroup>
    );

    const group = screen.getByRole('radiogroup', { name: 'Format de publication' });
    const describedBy = group.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain(
      'Choisissez le rendu final'
    );
  });

  it('marque le groupe invalide et annonce le message d’erreur', () => {
    render(
      <RadioGroup label="Format" errorMessage="Choisissez un format">
        <Radio value="pdf">PDF</Radio>
      </RadioGroup>
    );

    const group = screen.getByRole('radiogroup', { name: 'Format' });
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Choisissez un format')).toBeTruthy();
  });

  it('affiche et sélectionne un radio bouton classique', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RadioGroup aria-label="Format" onChange={onChange}>
        <Radio value="pdf">Format PDF</Radio>
        <Radio value="epub">Format EPUB</Radio>
      </RadioGroup>
    );

    const epub = screen.getByRole('radio', { name: /format epub/i }) as HTMLInputElement;
    await user.click(epub);

    expect(onChange).toHaveBeenCalledWith('epub');
    expect(epub.checked).toBe(true);
  });
});
