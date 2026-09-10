// ═══════════════════════════════════════════════════════════════════
// 🧪 apps/studio/vitest.setup.ts
// Configuration d'environnement de test Vitest pour apps/studio.
// ═══════════════════════════════════════════════════════════════════

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'placeholder_anon_key';

import '@testing-library/jest-dom/vitest';
import { expect, vi } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';

expect.extend(jestDomMatchers as Parameters<typeof expect.extend>[0]);

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'https://studio.qoe.fi/page',
    origin: 'https://studio.qoe.fi',
    pathname: '/page',
    search: '',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  },
  writable: true,
  configurable: true,
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

// Mock Next.js navigation
vi.mock('next/navigation', () => {
  const push = vi.fn();
  const replace = vi.fn();
  const refresh = vi.fn();
  const back = vi.fn();
  const forward = vi.fn();

  return {
    useRouter: () => ({ push, replace, refresh, back, forward }),
    usePathname: () => '/analytics',
    useSearchParams: () => new URLSearchParams(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
  };
});

// Mock Next.js headers (pour Server Components / Actions)
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => new Headers()),
}));

// Mock des macros Lingui
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === 'string') return strings;
    return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
  },
  msg: (strings: TemplateStringsArray) => strings[0] ?? '',
}));
