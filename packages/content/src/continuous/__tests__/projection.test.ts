import { describe, it, expect } from 'vitest';
import type { CanonicalDocument } from '../../canonical/types';
import {
  buildArticleText,
  canonicalAt,
  canonicalToDisplayCpRange,
  displayRangeToCanonical,
  canonicalSlice,
  ATTACHMENT_CHAR,
} from '../projection';
import { buildPaintSpans, buildParagraphLayouts } from '../attributed';

describe('continuous projection (C1 engine)', () => {
  const sampleDoc: CanonicalDocument = {
    sha: 'sha-sample-123',
    text: 'Premier paragraphe.\nDeuxième paragraphe avec du gras.',
    blocks: [
      {
        kind: 'p',
        text: 'Premier paragraphe.',
      },
      {
        kind: 'img',
        src: 'https://cdn.qoe.fi/test.png',
        alt: 'Illustration',
      },
      {
        kind: 'p',
        text: 'Deuxième paragraphe avec du gras.',
        inline: [
          {
            start: 28,
            end: 32,
            style: 'bold',
          },
        ],
      },
      {
        kind: 'list',
        ordered: false,
        items: [{ text: 'Puce un' }, { text: 'Puce deux' }],
      },
      {
        // @ts-expect-error test unknown block kind handling
        kind: 'unknown_embed',
        text: 'ignored content',
      },
    ],
    segments: [
      {
        blockIdx: 0,
        itemIdx: 0,
        text: 'Premier paragraphe.',
        start: 0,
        end: 19,
      },
      {
        blockIdx: 2,
        itemIdx: 0,
        text: 'Deuxième paragraphe avec du gras.',
        start: 20,
        end: 53,
      },
      {
        blockIdx: 3,
        itemIdx: 0,
        text: 'Puce un',
        start: 54,
        end: 61,
      },
      {
        blockIdx: 3,
        itemIdx: 1,
        text: 'Puce deux',
        start: 62,
        end: 71,
      },
    ],
  };

  it('buildArticleText compiles document into continuous text with attachments', () => {
    const model = buildArticleText(sampleDoc);

    expect(model.text).toContain('Premier paragraphe.');
    expect(model.text).toContain(ATTACHMENT_CHAR);
    expect(model.text).toContain('Deuxième paragraphe avec du gras.');
    expect(model.text).toContain('Puce un');
    expect(model.text).toContain('Puce deux');

    expect(model.attachments).toHaveLength(1);
    expect(model.attachments[0].kind).toBe('img');
    expect(model.attachments[0].src).toBe('https://cdn.qoe.fi/test.png');
  });

  it('canonicalAt maps display code point to canonical offset or -1 if synthetic', () => {
    const model = buildArticleText(sampleDoc);

    // 'P' of 'Premier paragraphe.'
    expect(canonicalAt(model, 0)).toBe(0);

    // Out of bounds
    expect(canonicalAt(model, -1)).toBe(-1);
    expect(canonicalAt(model, 99999)).toBe(-1);

    // Image attachment marker is synthetic (-1)
    const imgCp = model.attachments[0].cp;
    expect(canonicalAt(model, imgCp)).toBe(-1);
  });

  it('canonicalToDisplayCpRange maps canonical range to display range', () => {
    const model = buildArticleText(sampleDoc);

    // Intra-block exact range: 'Premier' [0, 7)
    const wordRange = canonicalToDisplayCpRange(model, 0, 7);
    expect(wordRange).toEqual({ startCp: 0, endCp: 7 });

    // End-of-block range [0, 19): extends through synthetic separator characters
    const blockRange = canonicalToDisplayCpRange(model, 0, 19);
    expect(blockRange).not.toBeNull();
    expect(blockRange?.startCp).toBe(0);
    expect(blockRange?.endCp).toBe(23); // Extends past synthetic \n and attachment marker
  });

  it('displayRangeToCanonical translates native selection into canonical bounds', () => {
    const model = buildArticleText(sampleDoc);

    // Selecting 'Premier paragraphe.'
    const canonicalRange = displayRangeToCanonical(model, 0, 19);
    expect(canonicalRange).toEqual({ start: 0, end: 19 });

    // Selecting only synthetic newline or attachment returns null
    const imgCp = model.attachments[0].cp;
    expect(displayRangeToCanonical(model, imgCp, imgCp + 1)).toBeNull();
  });

  it('canonicalSlice returns sliced canonical text', () => {
    const model = buildArticleText(sampleDoc);
    expect(canonicalSlice(model, 0, 7)).toBe('Premier');
  });

  it('buildPaintSpans decomposes text into styled runs with background', () => {
    const model = buildArticleText(sampleDoc);
    const coloredMarks = [
      {
        startCp: 0,
        endCp: 7,
        color: 0xffff0000,
      },
    ];

    const spans = buildPaintSpans(model, coloredMarks);
    expect(spans.length).toBeGreaterThan(0);

    // First span has red background
    expect(spans[0].bg).toBe(0xffff0000);
    // Span inside 'gras' has bold=true
    const boldSpan = spans.find((s) => s.bold);
    expect(boldSpan).toBeDefined();
  });

  it('buildParagraphLayouts extracts paragraph blocks with list markers', () => {
    const model = buildArticleText(sampleDoc);
    const layouts = buildParagraphLayouts(model);

    expect(layouts.length).toBeGreaterThanOrEqual(4);
    const listLayout = layouts.find((l) => l.listItem);
    expect(listLayout).toBeDefined();
    expect(listLayout?.markerText).toBe('\u2022  ');
  });
});
