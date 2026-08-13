// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as AnnotationsModule from '../index';

describe('Empirical Challenge: Subpath Export & TS Contracts Verification', () => {
  // Tests may run with cwd at the monorepo root or inside packages/ui.
  const rootDir = process.cwd().endsWith('packages/ui')
    ? path.resolve(process.cwd(), '../..')
    : process.cwd();
  const packageJsonPath = path.join(rootDir, 'packages/ui/package.json');

  it('1. package.json subpath export map is valid and clean', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(pkg.exports).toBeDefined();

    // Check main subpath export
    expect(pkg.exports['./annotations']).toBeDefined();

    // Check wildcards subpath export
    expect(pkg.exports['./annotations/*']).toBeDefined();

    // Verify target file exists
    const resolvedPath = path.join(rootDir, 'packages/ui', pkg.exports['./annotations']);
    expect(fs.existsSync(resolvedPath)).toBe(true);
  });

  it('2. Exports all required components and visual constants', () => {
    expect(AnnotationsModule.TextHighlighter).toBeDefined();
    expect(typeof AnnotationsModule.TextHighlighter).toBe('function');

    expect(AnnotationsModule.AnnotationSideDrawer).toBeDefined();
    expect(typeof AnnotationsModule.AnnotationSideDrawer).toBe('function');

    expect(AnnotationsModule.TextSelectionPopover).toBeDefined();
    expect(typeof AnnotationsModule.TextSelectionPopover).toBe('function');

    expect(AnnotationsModule.MARK_STYLE_CLASSES).toBeDefined();
    expect(AnnotationsModule.MARK_STYLE_CLASSES.official).toContain('highlight');
    expect(AnnotationsModule.MARK_STYLE_CLASSES.public).toContain('primary');
    expect(AnnotationsModule.MARK_STYLE_CLASSES.private).toContain('dashed');

    expect(AnnotationsModule.SPOTLIGHT_PULSE_CLASSES).toBeDefined();
    expect(AnnotationsModule.SPOTLIGHT_PULSE_CLASSES).toContain('ring-2');
  });

  it('3. TS paths mapping in consuming apps matches subpath export', () => {
    const webTsConfig = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'apps/web/tsconfig.json'), 'utf-8')
    );
    const feedTsConfig = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'apps/feed/tsconfig.json'), 'utf-8')
    );

    expect(webTsConfig.compilerOptions.paths['@qoe/ui/*']).toEqual(['../../packages/ui/src/*']);
    expect(feedTsConfig.compilerOptions.paths['@qoe/ui/*']).toEqual(['../../packages/ui/src/*']);
  });
});
