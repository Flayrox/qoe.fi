import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  toggleFollowCreatorAction: vi.fn(),
  toggleBookmarkArticleAction: vi.fn(),
  openAuthModal: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/tenant', () => ({
  toggleFollowCreatorAction: mocks.toggleFollowCreatorAction,
  toggleBookmarkArticleAction: mocks.toggleBookmarkArticleAction,
}));

vi.mock('@qoe/ui', () => ({
  useRequireAuth: () => ({
    openAuthModal: mocks.openAuthModal,
  }),
}));

import { ReaderActions } from '../ReaderActions';

const defaultProps = {
  articleId: 'art_123',
  publicationId: 'pub_456',
  creatorName: 'Victor Hugo',
  isAuthenticated: false,
  initialBookmarked: false,
  initialFollowed: false,
  mainAppUrl: 'https://qoe.fi',
};

describe('ReaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unauthenticated state with signup CTA', () => {
    render(<ReaderActions {...defaultProps} />);

    expect(screen.getByText("S'inscrire sur qoe.fi")).toBeInTheDocument();
    expect(screen.getByText('Suivre Victor Hugo')).toBeInTheDocument();
    expect(screen.queryByText('Surlignez du texte pour annoter')).not.toBeInTheDocument();
  });

  it('opens auth modal on bookmark click when unauthenticated', () => {
    render(<ReaderActions {...defaultProps} />);

    const bookmarkBtn = screen.getByTitle('Sauvegarder cet écrit');
    fireEvent.click(bookmarkBtn);

    expect(mocks.openAuthModal).toHaveBeenCalledWith({
      mode: 'signup',
      actionContext: 'bookmark',
    });
    expect(mocks.toggleBookmarkArticleAction).not.toHaveBeenCalled();
  });

  it('opens auth modal on follow click when unauthenticated', () => {
    render(<ReaderActions {...defaultProps} />);

    const followBtn = screen.getByText('Suivre Victor Hugo');
    fireEvent.click(followBtn);

    expect(mocks.openAuthModal).toHaveBeenCalledWith({
      mode: 'signup',
      actionContext: 'follow',
    });
    expect(mocks.toggleFollowCreatorAction).not.toHaveBeenCalled();
  });

  it('renders authenticated state and handles bookmark toggling', async () => {
    mocks.toggleBookmarkArticleAction.mockResolvedValue({
      ok: true,
      data: { bookmarked: true },
    });

    render(<ReaderActions {...defaultProps} isAuthenticated={true} />);

    expect(screen.queryByText("S'inscrire sur qoe.fi")).not.toBeInTheDocument();
    expect(screen.getByText('Surlignez du texte pour annoter')).toBeInTheDocument();

    const bookmarkBtn = screen.getByTitle('Sauvegarder cet écrit');
    fireEvent.click(bookmarkBtn);

    await waitFor(() => {
      expect(mocks.toggleBookmarkArticleAction).toHaveBeenCalledWith('art_123');
    });
  });

  it('handles follow toggling when authenticated', async () => {
    mocks.toggleFollowCreatorAction.mockResolvedValue({
      ok: true,
      data: { followed: true },
    });

    render(<ReaderActions {...defaultProps} isAuthenticated={true} />);

    const followBtn = screen.getByText('Suivre Victor Hugo');
    fireEvent.click(followBtn);

    await waitFor(() => {
      expect(mocks.toggleFollowCreatorAction).toHaveBeenCalledWith('pub_456');
    });

    await waitFor(() => {
      expect(screen.getByText('Abonné')).toBeInTheDocument();
    });
  });
});
