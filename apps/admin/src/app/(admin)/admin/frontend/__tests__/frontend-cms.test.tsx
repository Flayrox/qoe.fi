// @vitest-environment jsdom
// =====================================================================
// 🧪 CMS landing — un enregistrement refusé se dit
// =====================================================================
// Le formulaire ne traitait que le succès (`if (res.success)`) : un refus —
// capacité manquante, JSON invalide, preuve exigée — retombait dans le vide.
// Le bouton reprenait son aspect normal, aucun message, l'admin croyait la
// section enregistrée. Seul un succès doit faire silence sur l'échec.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const saveConfigs = vi.fn();

vi.mock('@/lib/admin-aux-actions', () => ({
  saveMultipleFrontendConfigs: (payload: unknown) => saveConfigs(payload),
}));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, part, i) => acc + part + (i < values.length ? String(values[i]) : ''), ''),
}));

import { FrontendCMS } from '../components/FrontendCMS';

describe('FrontendCMS — enregistrement', () => {
  afterEach(() => {
    cleanup();
    saveConfigs.mockReset();
  });

  it('dit le refus de l’enregistrement', async () => {
    saveConfigs.mockResolvedValue({
      success: false,
      error: 'Capacité admin.config.write requise',
    });

    render(<FrontendCMS initialConfigs={{}} />);

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer la section/ }));

    await waitFor(() => expect(saveConfigs).toHaveBeenCalled());
    expect(await screen.findByText(/Capacité admin\.config\.write requise/)).toBeTruthy();
  });
});
