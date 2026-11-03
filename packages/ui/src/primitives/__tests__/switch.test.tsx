import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from '../switch/switch';

describe('Switch', () => {
  it('porte la sémantique de switch et annonce son état aria-checked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch onChange={onChange}>Recommandations</Switch>);

    const switchEl = screen.getByRole('switch', { name: 'Recommandations' }) as HTMLInputElement;
    expect(switchEl).toBeTruthy();
    expect(switchEl.checked).toBe(false);

    await user.click(switchEl);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('peut être activé par défaut et basculer à l’espace', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch defaultSelected onChange={onChange}>
        Mode sombre
      </Switch>
    );

    const switchEl = screen.getByRole('switch', { name: 'Mode sombre' }) as HTMLInputElement;
    expect(switchEl.checked).toBe(true);

    switchEl.focus();
    await user.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('respecte l’état désactivé', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch isDisabled onChange={onChange}>
        Option verrouillée
      </Switch>
    );

    const switchEl = screen.getByRole('switch', { name: 'Option verrouillée' }) as HTMLInputElement;
    expect(switchEl.disabled).toBe(true);

    await user.click(switchEl);
    expect(onChange).not.toHaveBeenCalled();
  });
});
