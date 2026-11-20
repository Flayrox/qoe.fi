// @vitest-environment jsdom
// L20c8 — DynamicBannerSlot : le repli « Qoefi Plus » s'affiche quand aucun
// placement n'est programmé, avec quatre textes français en dur.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { tCalls } = vi.hoisted(() => ({ tCalls: [] as string[] }));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return `[${message}]`;
  },
}));

vi.mock('@qoe/flags', () => ({ useFlag: () => true }));
vi.mock('@qoe/config/routes', () => ({ routes: { feed: { pricing: () => '/pricing' } } }));
vi.mock('@/components/placements/InAppPlacement', () => ({
  InAppPlacement: ({ fallback }: { fallback?: React.ReactNode }) => <>{fallback}</>,
}));

import { DynamicBannerSlot } from '../../banners/DynamicBannerSlot';

afterEach(() => {
  cleanup();
  tCalls.length = 0;
});

describe('DynamicBannerSlot — repli traduit', () => {
  it('passe le titre, le badge, la description et le CTA par `t`', () => {
    render(<DynamicBannerSlot slot="reader.feed.top" />);

    expect(tCalls).toContain('Qoefi Plus pour lecteurs');
    expect(tCalls).toContain('Offre découverte');
    expect(tCalls).toContain('Découvrir les offres');
  });

  it('garde de source : plus aucun libellé en dur', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/banners/DynamicBannerSlot.tsx'),
      'utf-8'
    );
    expect(source).toContain("from '@lingui/core/macro'");
    expect(source).not.toMatch(/>\s*Découvrir les offres/);
  });
});
