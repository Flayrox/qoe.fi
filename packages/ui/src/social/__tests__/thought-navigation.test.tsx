import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThoughtCard, type ThoughtData } from '../ThoughtCard';
import { QuotedThoughtCard } from '../QuotedThoughtCard';
import { ShareMenu } from '../ShareMenu';

const DUMMY_THOUGHT: ThoughtData = {
  id: 'th_123',
  content: 'Hello this is a thought',
  createdAt: new Date().toISOString(),
  author: {
    id: 'user_1',
    name: 'Alice',
    username: 'alice',
  },
};

describe('Thought navigation & canonical URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to canonical thought url when ThoughtCard is clicked without onOpenPost', () => {
    const originalAssign = window.location.assign;
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        host: 'le-climat.qoe.fi',
        origin: 'https://le-climat.qoe.fi',
        assign: assignMock,
      },
    });

    render(<ThoughtCard post={DUMMY_THOUGHT} variant="timeline" />);

    const article = screen.getByRole('article');
    fireEvent.click(article);

    expect(assignMock).toHaveBeenCalledWith('https://qoe.fi/alice/thought/th_123');

    // Restore
    window.location.assign = originalAssign;
  });

  it('calls onOpenPost if provided instead of window.location.assign', () => {
    const onOpenPost = vi.fn();
    render(<ThoughtCard post={DUMMY_THOUGHT} variant="timeline" onOpenPost={onOpenPost} />);

    const article = screen.getByRole('article');
    fireEvent.click(article);

    expect(onOpenPost).toHaveBeenCalledWith('th_123', 'alice');
  });

  it('navigates to canonical thought url when QuotedThoughtCard is clicked without onOpenPost', () => {
    const originalAssign = window.location.assign;
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        host: 'le-climat.qoe.fi',
        origin: 'https://le-climat.qoe.fi',
        assign: assignMock,
      },
    });

    render(
      <QuotedThoughtCard
        post={{
          id: 'th_inner',
          content: 'Inner quoted thought',
          author: { id: 'u2', name: 'Bob', username: 'bob' },
        }}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(assignMock).toHaveBeenCalledWith('https://qoe.fi/bob/thought/th_inner');

    // Restore
    window.location.assign = originalAssign;
  });

  it('ShareMenu copies the canonical thought URL', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: writeTextMock },
    });

    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        host: 'le-climat.qoe.fi',
        origin: 'https://le-climat.qoe.fi',
      },
    });

    render(
      <ShareMenu
        id="th_123"
        authorHandle="alice"
        type="post"
        trigger={<button data-testid="share-btn">Share</button>}
      />
    );

    const btn = screen.getByTestId('share-btn');
    fireEvent.click(btn);

    // Click "Copier le lien"
    const copyLinkBtn = screen.getByText(/copier le lien/i);
    fireEvent.click(copyLinkBtn);

    expect(writeTextMock).toHaveBeenCalledWith('https://qoe.fi/alice/thought/th_123');
  });

  it('ShareMenu copies the canonical article URL across zones without origin pollution', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: writeTextMock },
    });

    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        host: 'studio.qoe.fi',
        origin: 'https://studio.qoe.fi',
      },
    });

    render(
      <ShareMenu
        id="mon-article"
        authorHandle="alex"
        type="article"
        trigger={<button data-testid="share-article-btn">Share Article</button>}
      />
    );

    const btn = screen.getByTestId('share-article-btn');
    fireEvent.click(btn);

    const copyLinkBtn = screen.getByText(/copier le lien/i);
    fireEvent.click(copyLinkBtn);

    expect(writeTextMock).toHaveBeenCalledWith('https://qoe.fi/alex/a/mon-article');
  });

  it('ShareMenu copies profile URL on main app domain when on a tenant domain', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: writeTextMock },
    });

    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        host: 'le-climat.qoe.fi',
        origin: 'https://le-climat.qoe.fi',
      },
    });

    render(
      <ShareMenu
        authorHandle="camille"
        type="profile"
        trigger={<button data-testid="share-profile-btn">Share Profile</button>}
      />
    );

    const btn = screen.getByTestId('share-profile-btn');
    fireEvent.click(btn);

    const copyLinkBtn = screen.getByText(/copier le lien/i);
    fireEvent.click(copyLinkBtn);

    expect(writeTextMock).toHaveBeenCalledWith('https://qoe.fi/camille');
  });
});
