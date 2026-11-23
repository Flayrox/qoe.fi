// @vitest-environment jsdom
// =====================================================================
// L20c7 — NotificationSettingsForm : garanties écrites AVANT correctif
// =====================================================================
// `useUpdateNotificationPreferencesMutation` jette sur échec
// (`unwrapActionResult(…, 'Enregistrement impossible')`), et le formulaire
// appelait `mutate` sans `onError` : un refus du serveur ne produisait
// **aucun** message, et le switch revenait à l'état serveur comme si le
// clic n'avait pas eu lieu. Même famille que F292 (échec silencieux).
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { mutateCalls, prefs } = vi.hoisted(() => ({
  mutateCalls: [] as { vars: unknown; hasOnError: boolean }[],
  prefs: { current: {} as Record<string, boolean> },
}));

vi.mock('@qoe/sdk', () => ({
  useNotificationPreferencesQuery: () => ({ data: prefs.current, isLoading: false }),
  useUpdateNotificationPreferencesMutation: () => ({
    mutate: (vars: unknown, options?: { onError?: (e: unknown) => void }) => {
      mutateCalls.push({ vars, hasOnError: typeof options?.onError === 'function' });
      options?.onError?.(new Error('Enregistrement impossible'));
    },
  }),
}));

vi.mock('@qoe/ui/switch', () => ({
  Switch: ({
    label,
    isSelected,
    onChange,
  }: {
    label?: string;
    isSelected?: boolean;
    onChange?: (v: boolean) => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={isSelected}
      aria-label={label}
      onClick={() => onChange?.(!isSelected)}
    />
  ),
}));

import { NotificationSettingsForm } from '../NotificationSettingsForm';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

afterEach(() => {
  cleanup();
  mutateCalls.length = 0;
  prefs.current = {};
});

const SOURCE = readFileSync(
  resolve(CORE_DIR, 'src/components/notifications/NotificationSettingsForm.tsx'),
  'utf-8'
);

describe('NotificationSettingsForm — échec d’enregistrement', () => {
  it('affiche l’échec au lieu de laisser le switch revenir en silence', async () => {
    render(<NotificationSettingsForm />);

    fireEvent.click(screen.getAllByRole('switch')[0]!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Enregistrement impossible');
    expect(mutateCalls).toHaveLength(1);
    expect(mutateCalls[0]!.hasOnError).toBe(true);
  });

  it('envoie bien la clé de la préférence touchée', () => {
    render(<NotificationSettingsForm />);

    fireEvent.click(screen.getAllByRole('switch')[0]!);

    expect(mutateCalls[0]!.vars).toEqual({ pushLikes: false });
  });
});

describe('NotificationSettingsForm — garde de source', () => {
  it('exige un chemin d’erreur explicite sur la mutation', () => {
    expect(SOURCE).toMatch(/onError/);
    expect(SOURCE).toContain('role="alert"');
  });
});
