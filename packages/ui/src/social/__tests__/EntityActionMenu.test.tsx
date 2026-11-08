import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityActionMenu } from '../EntityActionMenu';

const author = { id: 'author-1', username: 'jean', name: 'Jean' };

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: "Plus d'options" }));
}

describe('EntityActionMenu', () => {
  it("affiche les actions d'auteur sur une pensée épinglable", () => {
    const onPinToggle = vi.fn();
    const onDeleteClick = vi.fn();
    const onReportClick = vi.fn();

    render(
      <EntityActionMenu
        surface="thought-card-menu"
        context={{
          entityType: 'thought',
          entityId: 'post-1',
          url: 'https://qoe.test/jean/thought/post-1',
          text: 'un texte',
          author,
          viewerId: author.id,
        }}
        onPinToggle={onPinToggle}
        onDeleteClick={onDeleteClick}
        onReportClick={onReportClick}
      />
    );

    openMenu();
    expect(screen.getByText('Épingler')).toBeDefined();
    expect(screen.getByText('Supprimer')).toBeDefined();
    expect(screen.queryByText(/Bloquer/)).toBeNull();
  });

  it('expose la mise en sourdine à un lecteur tiers et la transmet au callback', () => {
    const onMuteUserToggle = vi.fn();

    render(
      <EntityActionMenu
        surface="thought-card-menu"
        context={{
          entityType: 'thought',
          entityId: 'post-1',
          author,
          viewerId: 'viewer-1',
        }}
        onMuteUserToggle={onMuteUserToggle}
      />
    );

    openMenu();
    const mute = screen.getByText('Mettre @jean en sourdine');
    fireEvent.click(mute);
    expect(onMuteUserToggle).toHaveBeenCalledTimes(1);
  });

  it('un visiteur ne voit ni sourdine ni suppression, mais copie le lien', () => {
    render(
      <EntityActionMenu
        surface="thought-card-menu"
        context={{
          entityType: 'thought',
          entityId: 'post-1',
          url: 'https://qoe.test/jean/thought/post-1',
          author,
          viewerId: null,
        }}
      />
    );

    openMenu();
    expect(screen.getByText('Copier le lien')).toBeDefined();
    expect(screen.queryByText(/sourdine/)).toBeNull();
    expect(screen.queryByText('Supprimer')).toBeNull();
  });

  it('un article gagne le signet et « voir moins »', () => {
    const onShowLessClick = vi.fn();

    render(
      <EntityActionMenu
        surface="article-card-menu"
        context={{
          entityType: 'article',
          entityId: 'artc_1',
          url: '/jean/a/mon-article',
          text: 'Mon article',
          isBookmarked: false,
          author,
          viewerId: 'viewer-1',
        }}
        onShowLessClick={onShowLessClick}
      />
    );

    openMenu();
    expect(screen.getByText('Ajouter aux signets')).toBeDefined();
    fireEvent.click(screen.getByText('Voir moins de contenu comme ça'));
    expect(onShowLessClick).toHaveBeenCalledTimes(1);
  });
});
