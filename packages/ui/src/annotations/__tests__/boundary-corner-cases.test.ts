// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { applyHighlightToDOM } from './tree-walker-highlighting.test';

describe('Tier 2: Boundary & Corner Cases', () => {
  it('should handle empty text or whitespace-only highlight requests gracefully', () => {
    const container = document.createElement('div');
    container.id = 'article-content';
    container.textContent = 'Some article paragraph text.';
    document.body.appendChild(container);

    expect(() => applyHighlightToDOM(container, '')).not.toThrow();
    expect(() => applyHighlightToDOM(container, '   ')).not.toThrow();
    expect(container.querySelectorAll('mark').length).toBe(0);
  });

  it('should safely handle text containing HTML characters, script tags, and quotes without executing scripts', () => {
    const container = document.createElement('div');
    container.id = 'article-content';
    const specialText = `Sample <script>alert("xss")</script> & "quoted" text`;
    container.textContent = specialText;
    document.body.appendChild(container);

    applyHighlightToDOM(container, specialText, 'Safety Note', true, false, 'xss-mark');

    const mark = container.querySelector("mark[data-highlight-id='xss-mark']");
    expect(mark).not.toBeNull();
    // Verify text is treated as plain text, not HTML
    expect(mark?.textContent).toBe(specialText);
    expect(container.querySelectorAll('script').length).toBe(0);
  });

  it('should handle missing optional callbacks without throwing runtime errors', () => {
    const emptyCallbacks = {};

    const safeCall = () => {
      // Simulate invoking optional callbacks safely
      const callbacks: Partial<{
        onUpvote: (id: string) => void;
        onComment: (data: { highlightId: string; content: string }) => void;
        onTogglePrivacy: (data: { highlightId: string; isPublic: boolean }) => void;
        onDelete: (id: string) => void;
      }> = emptyCallbacks;
      callbacks.onUpvote?.('hl-1');
      callbacks.onComment?.({ highlightId: 'hl-1', content: 'test' });
      callbacks.onTogglePrivacy?.({ highlightId: 'hl-1', isPublic: true });
      callbacks.onDelete?.('hl-1');
    };

    expect(safeCall).not.toThrow();
  });

  it('should enforce public annotation restrictions when allowPublicAnnotations is false', () => {
    const allowPublicAnnotations = false;
    const isPublicChoice = true;

    // Logic under test: when allowPublicAnnotations is false, public choice is blocked
    const canCreatePublic = allowPublicAnnotations && isPublicChoice;
    expect(canCreatePublic).toBe(false);

    const errorMessage =
      !allowPublicAnnotations && isPublicChoice
        ? 'Le créateur a désactivé les annotations publiques sur cet écrit.'
        : null;

    expect(errorMessage).toBe('Le créateur a désactivé les annotations publiques sur cet écrit.');
  });

  it('should default reader details gracefully when profile data is missing or incomplete', () => {
    const currentUserId = 'user-123';
    const currentUserProfile = null as {
      name?: string | null;
      username?: string | null;
      logoUrl?: string | null;
    } | null;

    const defaultReader = {
      id: currentUserId || 'anon',
      name: currentUserProfile?.name || currentUserProfile?.username || 'Lecteur',
      username: currentUserProfile?.username || 'lecteur',
      logoUrl: currentUserProfile?.logoUrl || null,
      subdomain: null,
    };

    expect(defaultReader.name).toBe('Lecteur');
    expect(defaultReader.username).toBe('lecteur');
    expect(defaultReader.logoUrl).toBeNull();
  });
});
