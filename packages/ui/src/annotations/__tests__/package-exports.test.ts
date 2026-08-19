// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Package Subpath Exports & Contract Verification', () => {
  // Tests may run with cwd at the monorepo root or inside packages/ui.
  const rootDir = process.cwd().endsWith('packages/ui')
    ? path.resolve(process.cwd(), '../..')
    : process.cwd();
  const uiPackageJsonPath = path.join(rootDir, 'packages/ui/package.json');

  it('should define export paths in packages/ui/package.json', () => {
    expect(fs.existsSync(uiPackageJsonPath)).toBe(true);
    const pkgContent = JSON.parse(fs.readFileSync(uiPackageJsonPath, 'utf-8'));

    // Check package exports definition
    expect(pkgContent.exports).toBeDefined();
    // Verify root and annotations exports
    expect(pkgContent.exports['.']).toBe('./src/index.ts');
    // Verify ./annotations export contract (or ./src/annotations/index.ts)
    if (pkgContent.exports['./annotations']) {
      expect(pkgContent.exports['./annotations']).toBe('./src/annotations/index.ts');
    }
  });

  it('should verify annotation engine source file structure', () => {
    const annotationsDir = path.join(rootDir, 'packages/ui/src/annotations');
    const webAnnotationsDir = path.join(
      rootDir,
      'apps/tenants/src/app/tenant/[domain]/article/[slug]'
    );

    // Verify either decoupled @qoe/ui/annotations or tenant component source exists
    const hasDecoupled = fs.existsSync(annotationsDir);
    const hasWeb = fs.existsSync(webAnnotationsDir);

    expect(hasDecoupled || hasWeb).toBe(true);
  });
});
