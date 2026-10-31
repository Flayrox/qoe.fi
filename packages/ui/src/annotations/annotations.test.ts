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
    // La teinte et le trait viennent du CSS du thème (`marks.css`) ; la
    // classe de peau (`qoe-mark-*`) est le seul choix laissé au composant.
    expect(MARK_STYLE_CLASSES.official).toContain('qoe-mark-official');
    expect(MARK_STYLE_CLASSES.public).toContain('qoe-mark-public');
    expect(MARK_STYLE_CLASSES.private).toContain('qoe-mark-private');
    expect(MARK_STYLE_CLASSES.highlight).toContain('qoe-mark-highlight');
    expect(MARK_STYLE_CLASSES.selection).toContain('qoe-mark-selection');
    // Plus de bordure héritée : elle doublonnait le trait et se cassait en
    // pointillés sur les citations multi-lignes.
    expect(MARK_STYLE_CLASSES.private).not.toContain('border-');
    // Aucune classe typographique : la marque ne change pas la police du
    // passage (la garantie est verrouillée par `font: inherit` dans le CSS).
    for (const classes of Object.values(MARK_STYLE_CLASSES)) {
      expect(classes).not.toMatch(/\bfont-|\bitalic\b|\bunderline\b/);
    }
  });

  it('verifies active text spotlight pulse ring classes match design specs', () => {
    expect(SPOTLIGHT_PULSE_CLASSES).toContain('ring-2 ring-primary/80');
    expect(SPOTLIGHT_PULSE_CLASSES).toContain('bg-highlight/40');
    expect(SPOTLIGHT_PULSE_CLASSES).toContain('shadow-lg shadow-highlight/30');
  });
});
