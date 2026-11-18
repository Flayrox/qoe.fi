// @vitest-environment jsdom
// =====================================================================
// 🔐 GlobalAuthModalProvider — pas de cycle d'import dans le paquet
// =====================================================================
// 📖 Le provider importait `AuthModalProvider`, `LoginModal` et
//    `useAuthModal` depuis **`@qoe/ui`**, c'est-à-dire depuis son propre
//    barrel — que le barrel est justement en train de charger. C'est un
//    cycle ESM : `index.ts` → `GlobalAuthModalProvider` → `index.ts`. Il
//    tient tant que personne ne lit les liaisons pendant l'initialisation
//    du module, et casse (`Cannot access 'X' before initialization`) dès
//    qu'un bundler réordonne. Le provider doit importer ses voisins
//    directement, comme le reste du paquet.
// =====================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('GlobalAuthModalProvider', () => {
  it('importe ses voisins directement, jamais via le barrel du paquet (F129)', () => {
    const code = source('../auth/GlobalAuthModalProvider.tsx');

    expect(code).not.toMatch(/from\s+['"]@qoe\/ui['"]/);
    expect(code).toMatch(/from\s+['"]\.\/AuthModalContext['"]/);
    expect(code).toMatch(/from\s+['"]\.\.\/LoginModal['"]/);
  });

  it('aucun module du paquet ne s’importe lui-même par son nom de paquet', () => {
    const offenders: string[] = [];
    for (const file of [
      '../auth/AuthModalContext.tsx',
      '../auth/GlobalAuthModalProvider.tsx',
      '../forms/index.ts',
      '../providers/locale.tsx',
      '../SubscribeForm.tsx',
      '../RecommendationModal.tsx',
      '../LoginModal.tsx',
    ]) {
      if (/from\s+['"]@qoe\/ui['"]/.test(source(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
