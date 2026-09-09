import { describe, it, expect, vi } from 'vitest';
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

// Mock react-native et react-native-svg pour environnement de test Node
vi.mock('react-native', () => ({
  View: ({ children, style }: ViewMockProps) => (
    <div data-native-view style={style}>
      {children}
    </div>
  ),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
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
}));

import {
  LogoSymbol as NativeLogoSymbol,
  LogoWordmark as NativeLogoWordmark,
  CertifiedBadge as NativeCertifiedBadge,
  MediaBadge as NativeMediaBadge,
  UserSilhouette as NativeUserSilhouette,
  MediaEmblem as NativeMediaEmblem,
  SocialIcon as NativeSocialIcon,
} from '../native';

describe('Native Brand Components', () => {
  it('LogoSymbol natif calcule les dimensions proportionnelles', () => {
    const html = renderToStaticMarkup(<NativeLogoSymbol height={28} color="#EE4B2B" />);
    expect(html).toContain('data-native-svg');
    expect(html).toContain('height="28"');
    expect(html).toContain('fill="#EE4B2B"');
  });

  it('LogoWordmark natif calcule le ratio ~2.585', () => {
    const html = renderToStaticMarkup(<NativeLogoWordmark height={28} color="#000000" />);
    expect(html).toContain('data-native-svg');
    expect(html).toContain('height="28"');
    expect(html).toContain('width="72"'); // 28 * 2.585 ≈ 72
  });

  it('CertifiedBadge natif affiche le cercle vermillon et la coche', () => {
    const html = renderToStaticMarkup(<NativeCertifiedBadge size={14} />);
    expect(html).toContain('data-native-svg');
    expect(html).toContain('r="7"');
    expect(html).toContain('fill="#EE4B2B"');
    expect(html).toContain('stroke="#FFFFFF"');
  });

  it('MediaBadge natif affiche le squircle', () => {
    const html = renderToStaticMarkup(<NativeMediaBadge size={16} />);
    expect(html).toContain('data-native-svg');
    expect(html).toContain('rx="4"');
  });

  it('UserSilhouette et MediaEmblem natifs fonctionnent', () => {
    const userHtml = renderToStaticMarkup(<NativeUserSilhouette size={20} />);
    expect(userHtml).toContain('data-native-svg');

    const mediaHtml = renderToStaticMarkup(<NativeMediaEmblem size={20} />);
    expect(mediaHtml).toContain('data-native-svg');
  });

  it('SocialIcon natif supporte les plateformes et le fallback', () => {
    const knownHtml = renderToStaticMarkup(<NativeSocialIcon platform="bluesky" size={24} />);
    expect(knownHtml).toContain('data-native-svg');

    const unknownHtml = renderToStaticMarkup(<NativeSocialIcon platform="unknown" size={24} />);
    expect(unknownHtml).toContain('data-native-svg');
  });
});
