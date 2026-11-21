import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 🔒 La tab bar est le seul chemin de navigation principal : sans rôle ni
// libellé, VoiceOver/TalkBack n'annoncent rien et l'app n'est pas utilisable
// au lecteur d'écran. Ce test balaie la source (même approche que
// `sidebar.wiring.test.ts`) et tombe si les libellés disparaissent.
const source = readFileSync(fileURLToPath(new URL('./LiquidTabBar.tsx', import.meta.url)), 'utf8');

describe('LiquidTabBar — navigation annonçable', () => {
  it('chaque onglet expose un rôle, un libellé traduit et son état sélectionné', () => {
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('accessibilityLabel={TAB_LABELS[route.name]');
    expect(source).toContain('accessibilityState={{ selected: isFocused }}');
  });

  it('le bouton composer est annoncé et traduit', () => {
    expect(source).toMatch(/accessibilityLabel=\{t\('tabs\.compose'/);
  });
});
