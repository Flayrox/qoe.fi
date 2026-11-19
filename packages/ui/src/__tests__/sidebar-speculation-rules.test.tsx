import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { Sidebar } from '../sidebar';

describe('Sidebar — règles de prérendu', () => {
  it('n’échappe pas la sortie de `<script>` quand l’URL contient les balises', () => {
    // F140 — `JSON.stringify` n'échappe pas `<`, `>` ni `&` : une URL qui
    // contient `</script>` ferme l'élément et le reste est interprété comme du
    // HTML. Le garde `guard:dangerous-html` exemptait ce fichier en affirmant
    // « pas du HTML » — le contenu d'un `<script>` n'est jamais du JSON inerte.
    const { container } = render(
      <Sidebar
        items={[]}
        activeUrl="/home"
        appSwitch={{ current: 'reader', counterpartHref: '</script><script>alert(1)</script>' }}
      />
    );

    const rules = container.querySelectorAll('script[type="speculationrules"]');
    expect(rules.length).toBe(1);
    const serialized = rules[0]?.textContent ?? '';
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c');
    // La règle reste du JSON valide, donc exploitable par le navigateur.
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});
