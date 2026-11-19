import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

interface MockProps {
  children?: React.ReactNode;
  [key: string]: unknown;
}

interface ViewMockProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

// Mêmes doublures que `native-components.test.tsx`, plus `Line` : le fallback
// web dessine cercle + méridien + ligne, la version native doit faire pareil.
vi.mock('react-native', () => ({
  View: ({ children, style }: ViewMockProps) => (
    <div data-native-view style={style}>
      {children}
    </div>
  ),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock('react-native-svg', () => ({
  default: ({ children, ...props }: MockProps) => (
    <svg data-native-svg {...(props as React.SVGProps<SVGSVGElement>)}>
      {children}
    </svg>
  ),
  Path: (props: MockProps) => <path {...(props as React.SVGProps<SVGPathElement>)} />,
  Circle: (props: MockProps) => <circle {...(props as React.SVGProps<SVGCircleElement>)} />,
  Rect: (props: MockProps) => <rect {...(props as React.SVGProps<SVGRectElement>)} />,
  Line: (props: MockProps) => <line {...(props as React.SVGProps<SVGLineElement>)} />,
}));

import { SocialIcon as WebSocialIcon } from '../index';
import {
  SocialIcon as NativeSocialIcon,
  LogoSymbol as NativeLogoSymbol,
  LogoWordmark as NativeLogoWordmark,
} from '../native';
import { getDefaultAvatar } from '../avatars';
import { BRAND_LOGOS } from '../paths';

describe('🌐 SocialIcon — clés héritées', () => {
  it('rend le fallback web pour une clé du prototype, pas une icône vide', () => {
    // F146 — `BRAND_SOCIAL_ICONS[key]` retournait `Object.prototype.constructor`
    // (objet truthy) pour `platform="constructor"` : le composant sortait du
    // registre avec `viewBox`/`path` indéfinis et rendait un SVG vide.
    for (const platform of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const html = renderToStaticMarkup(<WebSocialIcon platform={platform} />);
      expect(html, platform).toContain('<line');
      expect(html, platform).toContain('<circle');
    }
  });

  it('rend le fallback natif complet (cercle, méridien et ligne)', () => {
    const protoHtml = renderToStaticMarkup(<NativeSocialIcon platform="constructor" />);
    expect(protoHtml).toContain('<circle');
    expect(protoHtml).toContain('<line');

    // F148 — une plateforme inconnue ne dessinait qu'un cercle nu côté natif,
    // là où le web affiche le globe complet : l'écran mobile perdait le repère.
    const unknownHtml = renderToStaticMarkup(<NativeSocialIcon platform="unknown" />);
    expect(unknownHtml).toContain('<line');
    expect(unknownHtml).toContain('<path');
  });
});

describe('📐 ratios natifs', () => {
  it('déduit la hauteur d’une largeur imposée (LogoSymbol)', () => {
    // F147 — `width` seul laissait la hauteur à `size` (28) : le glyphe Q
    // rendait 100 × 28, écrasé, au lieu de respecter le viewBox.
    const html = renderToStaticMarkup(<NativeLogoSymbol width={100} />);
    const expected = Math.round(100 / BRAND_LOGOS.symbol.aspectRatio);
    expect(html).toContain(`height="${expected}"`);
  });

  it('déduit la largeur du viewBox du wordmark (et non du 2,585 arrondi)', () => {
    // F147 — le ratio était recopié à la main : à h=548 il donnait 1417 px de
    // large pour un viewBox de 1416, alors que `BRAND_LOGOS.wordmark.aspectRatio`
    // est exporté pour ça.
    const fromHeight = renderToStaticMarkup(<NativeLogoWordmark height={548} />);
    expect(fromHeight).toContain(`width="${Math.round(548 * BRAND_LOGOS.wordmark.aspectRatio)}"`);
    expect(fromHeight).toContain('width="1416"');

    const fromWidth = renderToStaticMarkup(<NativeLogoWordmark width={1416} />);
    expect(fromWidth).toContain('height="548"');
  });
});

describe('👤 getDefaultAvatar', () => {
  it('tronque un identifiant fractionnaire au lieu de retomber sur l’avatar 1', () => {
    // F149 — `DEFAULT_AVATARS[3.7 - 1]` vaut `undefined` : un id non entier
    // renvoyait silencieusement l'avatar 1 à la place du troisième.
    expect(getDefaultAvatar(3.7).id).toBe(3);
    expect(getDefaultAvatar(10.9).id).toBe(10);
    expect(getDefaultAvatar('7.9').id).toBe(7);
  });
});
