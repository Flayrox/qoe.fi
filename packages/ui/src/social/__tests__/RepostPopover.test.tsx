import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepostPopover } from '../RepostPopover';

describe('RepostPopover', () => {
  it('affiche le statut non-repartagé et déclenche onRepost', async () => {
    const onRepost = vi.fn();
    const onQuote = vi.fn();

    render(
      <RepostPopover
        reposted={false}
        repostsCount={3}
        targetType="thought"
        onRepost={onRepost}
        onQuote={onQuote}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Repartager' });
    expect(trigger).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();

    fireEvent.click(trigger);

    const repostOption = await screen.findByRole('button', { name: 'Repartager' });
    fireEvent.click(repostOption);
    expect(onRepost).toHaveBeenCalledTimes(1);
  });

  it('affiche le libellé d’annulation et déclenche onQuote pour un article', async () => {
    const onRepost = vi.fn();
    const onQuote = vi.fn();

    render(
      <RepostPopover
        reposted={true}
        repostsCount={5}
        targetType="article"
        onRepost={onRepost}
        onQuote={onQuote}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Repartager' });
    fireEvent.click(trigger);

    expect(await screen.findByText('Annuler le repartage')).toBeDefined();
    const quoteOption = await screen.findByRole('button', { name: "Citer l'article" });
    fireEvent.click(quoteOption);
    expect(onQuote).toHaveBeenCalledTimes(1);
  });
});
