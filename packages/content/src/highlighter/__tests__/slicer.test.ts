import { describe, it, expect } from 'vitest';
import type { CanonicalDocument } from '../../canonical/types';
import { segmentWindow, toLocalRange } from '../segment-window';
import { runBoundaries, marksCovering, styleSegments, sliceMarksForSegment } from '../slicer';
import type { GenericPaintMark } from '../types';

describe('highlighter/slicer & segment-window', () => {
  const sampleDoc: CanonicalDocument = {
    sha: 'sha-slicer',
    text: 'Introduction au document.\nSuite de la lecture.',
    blocks: [
      { kind: 'p', text: 'Introduction au document.' },
      { kind: 'p', text: 'Suite de la lecture.' },
    ],
    segments: [
      { blockIdx: 0, itemIdx: 0, text: 'Introduction au document.', start: 0, end: 25 },
      { blockIdx: 1, itemIdx: 0, text: 'Suite de la lecture.', start: 26, end: 46 },
    ],
  };

  describe('segmentWindow & toLocalRange', () => {
    it('segmentWindow finds segment start and end', () => {
      expect(segmentWindow(sampleDoc, 0, 0)).toEqual({ start: 0, end: 25 });
      expect(segmentWindow(sampleDoc, 1, 0)).toEqual({ start: 26, end: 46 });
      expect(segmentWindow(sampleDoc, 99, 0)).toBeNull();
    });

    it('toLocalRange converts global range to local window offset', () => {
      // Window is [10, 30), global mark is [15, 25) -> local [5, 15)
      expect(toLocalRange(10, 30, 15, 25)).toEqual({ start: 5, end: 15 });

      // Overlapping start: global [5, 15) in window [10, 30) -> local [0, 5)
      expect(toLocalRange(10, 30, 5, 15)).toEqual({ start: 0, end: 5 });

      // Completely outside: returns null
      expect(toLocalRange(10, 30, 0, 5)).toBeNull();
      expect(toLocalRange(10, 30, 35, 40)).toBeNull();
    });
  });

  describe('runBoundaries & marksCovering', () => {
    it('computes sorted unique boundary points', () => {
      const marks = [
        { start: 5, end: 15 },
        { start: 10, end: 20 },
      ];
      expect(runBoundaries(30, marks)).toEqual([0, 5, 10, 15, 20, 30]);
    });

    it('marksCovering returns marks spanning the slice', () => {
      const marks = [
        { id: 'm1', start: 0, end: 20 },
        { id: 'm2', start: 10, end: 15 },
      ];

      // Slice [5, 10) is covered by m1 only
      expect(marksCovering(marks, 5, 10).map((m) => m.id)).toEqual(['m1']);
      // Slice [10, 15) is covered by both m1 and m2
      expect(marksCovering(marks, 10, 15).map((m) => m.id)).toEqual(['m1', 'm2']);
    });
  });

  describe('styleSegments', () => {
    it('decomposes span styles into continuous segments and captures links', () => {
      const inline = [
        { start: 2, end: 8, style: 'bold' },
        { start: 5, end: 10, style: 'link', href: 'https://qoe.fi' },
      ];
      const segments = styleSegments(0, 12, inline);

      expect(segments).toHaveLength(5);
      // [0, 2): no styles
      expect(segments[0]).toMatchObject({ start: 0, end: 2, styles: [] });
      // [2, 5): bold only
      expect(segments[1]).toMatchObject({ start: 2, end: 5, styles: ['bold'] });
      // [5, 8): bold + link
      expect(segments[2]).toMatchObject({
        start: 5,
        end: 8,
        styles: ['bold', 'link'],
        href: 'https://qoe.fi',
      });
      // [8, 10): link only
      expect(segments[3]).toMatchObject({
        start: 8,
        end: 10,
        styles: ['link'],
        href: 'https://qoe.fi',
      });
      // [10, 12): no styles
      expect(segments[4]).toMatchObject({ start: 10, end: 12, styles: [] });
    });
  });

  describe('sliceMarksForSegment', () => {
    it('returns empty array when windowEnd <= windowStart', () => {
      expect(sliceMarksForSegment([], 10, 10)).toEqual([]);
      expect(sliceMarksForSegment([], 20, 10)).toEqual([]);
    });
    it('slices overlapping global marks across segment window', () => {
      const globalMarks: GenericPaintMark[] = [
        { id: 'highlight-1', start: 5, end: 15 },
        { id: 'highlight-2', start: 10, end: 25 },
      ];

      // Window [0, 20)
      const runs = sliceMarksForSegment(globalMarks, 0, 20);

      // Runs: [0, 5), [5, 10), [10, 15), [15, 20)
      expect(runs).toHaveLength(4);

      expect(runs[0].activeMarks).toHaveLength(0);
      expect(runs[1].activeMarks.map((m) => m.id)).toEqual(['highlight-1']);
      expect(runs[2].activeMarks.map((m) => m.id)).toEqual(['highlight-1', 'highlight-2']);
      expect(runs[3].activeMarks.map((m) => m.id)).toEqual(['highlight-2']);
    });
  });
});
