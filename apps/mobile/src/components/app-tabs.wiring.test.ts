import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 🔒 Les onglets Expo ne peuvent pas être montés en `node` sans mocks RN.
// Ce test verrouille donc le BRANCHEMENT réel des deux fichiers : sélecteur du
// manifeste, plateforme explicite, mappage des champs, et absence de toute
// liste, route, libellé, filtre ou tri recopiés localement.
const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

const NATIVE = read('./app-tabs.tsx');
const WEB = read('./app-tabs.web.tsx');
const TAB_LABELS = ['Profil', 'Explorer', 'Feed', 'Activité', 'Messages'];

describe('onglets Expo branchés sur le manifeste', () => {
  it('chaque variante appelle le sélecteur avec sa plateforme', () => {
    expect(NATIVE).toContain("getMobileSurfaces('native')");
    expect(WEB).toContain("getMobileSurfaces('web')");
    expect(NATIVE).not.toContain("getMobileSurfaces('web')");
    expect(WEB).not.toContain("getMobileSurfaces('native')");
  });

  it('mappe le nom de route, le libellé et le chemin fournis par la surface', () => {
    expect(NATIVE).toContain('name={requireRouteName(surface)}');
    expect(NATIVE).toContain('title: surface.defaultLabel');
    expect(NATIVE).toContain("surface.id === 'mobile.feed'");
    expect(NATIVE).toContain('requireRouteName(feed)');

    expect(WEB).toContain('name={requireRouteName(surface)}');
    expect(WEB).toContain('href={surface.path as Href}');
    expect(WEB).toContain('{surface.defaultLabel}');
  });

  it('ne recopie aucune route, aucun libellé et aucun filtre local', () => {
    for (const source of [NATIVE, WEB]) {
      // Un `name` littéral = un onglet qui ne vient plus du manifeste.
      expect(source).not.toMatch(/\bname\s*=\s*['"`]/);
      expect(source).not.toMatch(/\bname=\{\s*['"`]/);
      // Filtrer ou trier localement changerait l'ordre/la présence décidés
      // par `nativeOrder` / `webOrder` et `showOnNative` / `showOnWeb`.
      expect(source).not.toMatch(/\.filter\(/);
      expect(source).not.toMatch(/\.sort\(/);
      for (const label of TAB_LABELS) {
        expect(source).not.toContain(`'${label}'`);
      }
    }
    // Un seul point de montage par variante, alimenté par le `.map`.
    expect(NATIVE.match(/<Tabs\.Screen/g)).toHaveLength(1);
    expect(WEB.match(/<TabTrigger/g)).toHaveLength(1);
  });

  it('n’a aucun fallback silencieux de route', () => {
    for (const source of [NATIVE, WEB]) {
      expect(source).toContain('requireRouteName');
      expect(source).not.toMatch(/routeName\s*\?\?/);
      expect(source).not.toMatch(/\?\?\s*['"]index['"]/);
    }
  });
});
