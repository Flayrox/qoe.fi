// @vitest-environment jsdom
// =====================================================================
// 👤 PreviewableUserAvatar — le clic ne se perd pas dans la carte
// =====================================================================
// 📖 La branche « avec carte de survol » rendait `UserAvatar` sans lui
//    transmettre `onClick` : le même avatar ouvrait le profil sans carte,
//    et ne faisait rien dès qu'un `username` permettait la carte. La carte
//    est ici neutralisée pour isoler la transmission de la prop.
// =====================================================================

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../social/ProfileHoverCard', () => ({
  ProfileHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { PreviewableUserAvatar } from '../PreviewableUserAvatar';

describe('PreviewableUserAvatar', () => {
  it('transmet onClick quand la carte de survol est active', () => {
    const onClick = vi.fn();
    render(
      <PreviewableUserAvatar
        user={{ id: 'u1', name: 'Camille', username: 'camille' }}
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByLabelText('Camille'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('transmet onClick quand la carte de survol est désactivée', () => {
    const onClick = vi.fn();
    render(
      <PreviewableUserAvatar
        user={{ id: 'u1', name: 'Camille', username: 'camille' }}
        disableHoverCard
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByLabelText('Camille'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
