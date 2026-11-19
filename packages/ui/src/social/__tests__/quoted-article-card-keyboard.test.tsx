import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@qoe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/config')>();
  return {
    ...actual,
    getArticleUrl: () => 'https://qoe.fi/alice/a/mon-article',
  };
});

import { QuotedArticleCard } from '../QuotedArticleCard';

describe('QuotedArticleCard — ouverture', () => {
  it('est un lien nommé, accessible au clavier, qui protège la fenêtre d’origine', () => {
    // F139 — la carte était un `<div onClick>` : ni rôle, ni arrêt de
    // tabulation, donc impossible à ouvrir sans souris ; et `window.open` sans
    // `noopener` laissait la page ouverte réécrire l'onglet qoe.fi.
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<QuotedArticleCard article={{ id: 'a1', title: 'Mon article', slug: 'mon-article' }} />);

    const link = screen.getByRole('link', { name: /Mon article/ });
    expect(link.getAttribute('href')).toBe('https://qoe.fi/alice/a/mon-article');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');

    fireEvent.click(link);
    expect(open).toHaveBeenCalledWith(
      'https://qoe.fi/alice/a/mon-article',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
