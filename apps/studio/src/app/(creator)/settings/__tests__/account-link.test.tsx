// =====================================================================
// 🧪 AccountLink — l'origine vient de la config, pas d'un hôte écrit à la main
// =====================================================================
// Le lien pointait vers `https://qoe.fi/settings` en dur : en développement
// (qoe.test) et sur toute instance auto-hébergée, « Gérer mon compte »
// envoyait vers la production. L'origine doit venir de `URLS.CONSOLE`.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { URLS } from '@qoe/config';
import { AccountLink } from '../account-link';

describe('AccountLink', () => {
  it('suit l’origine configurée pour la console', () => {
    render(<AccountLink />);

    expect(screen.getByRole('link', { name: /gérer mon compte/i })).toHaveAttribute(
      'href',
      `${URLS.CONSOLE}/settings`
    );
  });
});
