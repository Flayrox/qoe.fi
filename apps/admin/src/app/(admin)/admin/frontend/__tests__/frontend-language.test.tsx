// @vitest-environment jsdom
// =====================================================================
// 🧪 CMS landing — la langue d'édition par défaut est le français
// =====================================================================
// L'écran prenait `ALL_LANGUAGES[0]` comme langue d'édition, et cette liste
// commence par « en » : sur une console française, le CMS s'ouvrait donc sur
// les champs anglais. Un admin qui éditait « le titre » modifiait la version
// anglaise du site, sans que rien ne le signale — le libellé du champ porte
// bien la langue, mais le premier champ qu'on voit est celui de la mauvaise.
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

describe('FrontendCMS — langue par défaut', () => {
  afterEach(() => cleanup());

  it('édite le français à l’ouverture', () => {
    render(
      <FrontendCMS
        initialConfigs={{
          creator_hub_title_fr: 'Une infrastructure pour ceux qui pensent.',
          creator_hub_title_en: 'An infrastructure for thinkers.',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Espace Créateurs' }));

    expect(screen.getByDisplayValue('Une infrastructure pour ceux qui pensent.')).toBeTruthy();
  });
});
