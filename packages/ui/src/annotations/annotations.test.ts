import { describe, it, expect } from 'vitest';
import { MARK_STYLE_CLASSES, SPOTLIGHT_PULSE_CLASSES } from './types';
import * as AnnotationsEntry from './index';

describe('@qoe/ui/annotations exports & styling', () => {
  it('exports required components and types from index', () => {
    expect(AnnotationsEntry.TextHighlighter).toBeDefined();
    expect(AnnotationsEntry.AnnotationSideDrawer).toBeDefined();
    expect(AnnotationsEntry.TextSelectionPopover).toBeDefined();
    expect(AnnotationsEntry.MARK_STYLE_CLASSES).toBeDefined();
    expect(AnnotationsEntry.SPOTLIGHT_PULSE_CLASSES).toBeDefined();
  });

  it('verifies mark styling classes match design specs', () => {
    expect(MARK_STYLE_CLASSES.official).toContain('bg-highlight/20');
    expect(MARK_STYLE_CLASSES.official).toContain('border-highlight');
    expect(MARK_STYLE_CLASSES.public).toContain('bg-primary/20');
    expect(MARK_STYLE_CLASSES.public).toContain('border-primary/50');
    expect(MARK_STYLE_CLASSES.private).toContain('bg-highlight/15');
    expect(MARK_STYLE_CLASSES.private).toContain('border-dashed');
    expect(MARK_STYLE_CLASSES.private).toContain('border-highlight/60');
  });

  it('verifies active text spotlight pulse ring classes match design specs', () => {
    expect(SPOTLIGHT_PULSE_CLASSES).toContain('ring-2 ring-primary/80');
    expect(SPOTLIGHT_PULSE_CLASSES).toContain('bg-highlight/40');
    expect(SPOTLIGHT_PULSE_CLASSES).toContain('shadow-lg shadow-highlight/30');
  });
});
