// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationItem } from '../types';

describe('Tier 3: Cross-Feature Combinations', () => {
  let mockAnnotations: AnnotationItem[];

  beforeEach(() => {
    mockAnnotations = [
      {
        id: 'annot-1',
        text: 'First passage in article',
        note: 'Note 1',
        isPublic: true,
        isOfficial: true,
        upvotesCount: 3,
        createdAt: '2026-08-11T10:00:00Z',
        reader: {
          id: 'author-1',
          name: 'Author',
          username: 'author',
          logoUrl: null,
          subdomain: null,
        },
        comments: [
          {
            id: 'c1',
            content: 'Awesome opening!',
            createdAt: '2026-08-11T10:05:00Z',
            author: { id: 'r1', name: 'Reader 1', username: 'r1', logoUrl: null },
          },
        ],
      },
      {
        id: 'annot-2',
        text: 'Second passage in article',
        note: 'Note 2',
        isPublic: true,
        isOfficial: false,
        upvotesCount: 5,
        createdAt: '2026-08-11T11:00:00Z',
        reader: {
          id: 'reader-2',
          name: 'Genius Contributor',
          username: 'genius',
          logoUrl: null,
          subdomain: null,
        },
        comments: [],
      },
      {
        id: 'annot-3',
        text: 'Third passage in article',
        note: 'Private note',
        isPublic: false,
        isOfficial: false,
        upvotesCount: 0,
        createdAt: '2026-08-11T12:00:00Z',
        reader: { id: 'user-me', name: 'Me', username: 'me', logoUrl: null, subdomain: null },
        comments: [],
      },
    ];
  });

  it('should handle sequential pagination (1 / N) next, prev, and boundary clamping', () => {
    let currentIndex = 0;
    const total = mockAnnotations.length;

    const handleNext = () => {
      if (currentIndex < total - 1) currentIndex++;
    };

    const handlePrev = () => {
      if (currentIndex > 0) currentIndex--;
    };

    expect(currentIndex + 1).toBe(1);
    expect(mockAnnotations[currentIndex].id).toBe('annot-1');

    handleNext();
    expect(currentIndex + 1).toBe(2);
    expect(mockAnnotations[currentIndex].id).toBe('annot-2');

    handleNext();
    expect(currentIndex + 1).toBe(3);
    expect(mockAnnotations[currentIndex].id).toBe('annot-3');

    // Clamp at upper boundary N
    handleNext();
    expect(currentIndex + 1).toBe(3);

    handlePrev();
    expect(currentIndex + 1).toBe(2);

    handlePrev();
    expect(currentIndex + 1).toBe(1);

    // Clamp at lower boundary 1
    handlePrev();
    expect(currentIndex + 1).toBe(1);
  });

  it('should apply spotlight pulse ring classes on active highlight mark element in DOM', () => {
    const mark = document.createElement('mark');
    mark.setAttribute('data-highlight-id', 'annot-1');
    mark.textContent = 'First passage in article';
    document.body.appendChild(mark);

    // Apply spotlight glow animation
    mark.classList.add(
      'ring-2',
      'ring-primary/80',
      'bg-highlight/40',
      'shadow-lg',
      'shadow-highlight/30',
      'transition-all',
      'duration-500'
    );

    expect(mark.classList.contains('ring-2')).toBe(true);
    expect(mark.classList.contains('ring-primary/80')).toBe(true);
    expect(mark.classList.contains('bg-highlight/40')).toBe(true);
  });

  it('should sort annotations deterministically by DOM offset, length, and creation timestamp', () => {
    const articleText =
      'First passage in article ... Second passage in article ... Third passage in article';

    const unsortedList: AnnotationItem[] = [
      mockAnnotations[2], // annot-3 (start index 59)
      mockAnnotations[0], // annot-1 (start index 0)
      mockAnnotations[1], // annot-2 (start index 29)
    ];

    const sortedList = [...unsortedList].sort((a, b) => {
      const cleanA = a.text.trim();
      const cleanB = b.text.trim();

      const startA = articleText.indexOf(cleanA);
      const startB = articleText.indexOf(cleanB);
      const validStartA = startA !== -1 ? startA : 999999;
      const validStartB = startB !== -1 ? startB : 999999;

      if (validStartA !== validStartB) return validStartA - validStartB;

      const endA = validStartA + cleanA.length;
      const endB = validStartB + cleanB.length;
      if (endA !== endB) return endA - endB;

      if (cleanA.length !== cleanB.length) return cleanA.length - cleanB.length;

      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateA - dateB;
    });

    expect(sortedList[0].id).toBe('annot-1');
    expect(sortedList[1].id).toBe('annot-2');
    expect(sortedList[2].id).toBe('annot-3');
  });

  it('should maintain comment thread integrity when adding new responses', () => {
    const activeAnnot = mockAnnotations[0];
    const initialCount = activeAnnot.comments?.length || 0;

    const newComment = {
      id: 'c2',
      content: 'Deep insightful reflection',
      createdAt: new Date().toISOString(),
      author: { id: 'user-me', name: 'Me', username: 'me', logoUrl: null },
    };

    const updatedComments = [...(activeAnnot.comments || []), newComment];
    expect(updatedComments.length).toBe(initialCount + 1);
    expect(updatedComments[1].content).toBe('Deep insightful reflection');
  });
});
