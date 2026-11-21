// @vitest-environment jsdom
// =====================================================================
// 🧪 Espace créateurs — un contenu mal formé ne doit pas vider l'éditeur
// =====================================================================
// `CreatorHubTabsBuilder` rendait `null` dès que la valeur en base ne décodait
// pas exactement trois onglets : l'admin voyait une zone vide, sans message et
// sans le bouton « Restaurer le modèle » qui aurait permis de réparer. Le repli
// sur le modèle est maintenant rendu — et proposé au formulaire — au lieu de
// disparaître.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/admin-aux-actions', () => ({
  saveMultipleFrontendConfigs: async () => ({ success: true }),
}));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, part, i) => acc + part + (i < values.length ? String(values[i]) : ''), ''),
}));

import { FrontendCMS } from '../components/FrontendCMS';

describe('FrontendCMS — onglets créateurs', () => {
  afterEach(() => cleanup());

  it('rend le modèle quand la valeur en base est mal formée', () => {
    render(<FrontendCMS initialConfigs={{ creator_hub_tabs_fr: '{"tabs":"cassé"}' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Espace Créateurs' }));

    expect(screen.getByRole('button', { name: 'Créateurs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Médias & CMS' })).toBeTruthy();
  });
});
