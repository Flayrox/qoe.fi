// @vitest-environment jsdom
// =====================================================================
// 🌗 ThemeToggle — un clic, un changement
// =====================================================================
// 📖 `theme` vaut « system » tant que l'utilisateur n'a rien choisi. Basculer
//    sur cette valeur posait « dark » alors que l'écran était déjà sombre :
//    le premier clic ne faisait rien de visible. On bascule donc sur
//    `resolvedTheme`, celui qui est réellement peint.
// =====================================================================

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { setTheme, themeState } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  themeState: { theme: 'system', resolvedTheme: 'dark' as string | undefined },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeState.theme, resolvedTheme: themeState.resolvedTheme, setTheme }),
}));

import { ThemeToggle } from '../ThemeToggle';

beforeEach(() => {
  setTheme.mockClear();
  themeState.theme = 'system';
  themeState.resolvedTheme = 'dark';
});

describe('ThemeToggle', () => {
  it('nomme le bouton en français et annonce l’état peint', async () => {
    render(<ThemeToggle />);

    const button = await screen.findByRole('button', { name: 'Basculer le thème' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('bascule vers le clair quand le thème affiché est sombre (« system » compris)', async () => {
    render(<ThemeToggle />);

    fireEvent.click(await screen.findByRole('button', { name: 'Basculer le thème' }));

    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('light'));
  });

  it('bascule vers le sombre depuis le clair', async () => {
    themeState.resolvedTheme = 'light';
    render(<ThemeToggle />);

    fireEvent.click(await screen.findByRole('button', { name: 'Basculer le thème' }));

    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('dark'));
  });
});
