import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextParser } from '../TextParser';

vi.mock('@qoe/sdk/actions/feed', () => ({
  resolveProfileAction: vi.fn(),
  toggleFollowCreatorHomeAction: vi.fn(),
}));

describe('TextParser — mentions et blocage', () => {
  it('rend une mention normale en tant que lien actif avec ProfileHoverCard', () => {
    const onMentionClick = vi.fn();
    render(
      <TextParser content="Bonjour @alice comment vas-tu ?" onMentionClick={onMentionClick} />
    );

    const mention = screen.getByText('@alice');
    expect(mention).toBeDefined();
    expect(mention.className).toContain('cursor-pointer');
    expect(mention.className).toContain('hover:underline');
    expect(mention.getAttribute('data-blocked-mention')).toBeNull();

    fireEvent.click(mention);
    expect(onMentionClick).toHaveBeenCalledWith('alice');
  });

  it("rend une mention d'un compte bloqué en texte inerte sans lien ni hover card", () => {
    const onMentionClick = vi.fn();
    render(
      <TextParser
        content="Salut @alice et @bob !"
        blockedUsernames={['alice']}
        onMentionClick={onMentionClick}
      />
    );

    const blockedMention = screen.getByText('@alice');
    expect(blockedMention).toBeDefined();
    expect(blockedMention.getAttribute('data-blocked-mention')).toBe('true');
    expect(blockedMention.className).not.toContain('cursor-pointer');
    expect(blockedMention.className).not.toContain('hover:underline');

    // Le clic sur la mention bloquée ne déclenche aucun événement de navigation
    fireEvent.click(blockedMention);
    expect(onMentionClick).not.toHaveBeenCalled();

    // La mention non bloquée (@bob) reste active
    const activeMention = screen.getByText('@bob');
    expect(activeMention.className).toContain('cursor-pointer');
    fireEvent.click(activeMention);
    expect(onMentionClick).toHaveBeenCalledWith('bob');
  });

  it('gère Set et insensibilité à la casse pour blockedUsernames', () => {
    render(
      <TextParser content="Message pour @ALICE_Dev" blockedUsernames={new Set(['alice_dev'])} />
    );

    const blockedMention = screen.getByText('@ALICE_Dev');
    expect(blockedMention.getAttribute('data-blocked-mention')).toBe('true');
    expect(blockedMention.className).not.toContain('cursor-pointer');
  });
});
