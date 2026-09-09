// ═══════════════════════════════════════════════════════════════════
// 📱 @qoe/brand — native.tsx (Cible React Native / Expo)
// Composants vectoriels natifs sans DOM (utilisant react-native-svg).
// Import : import { LogoWordmark, CertifiedBadge } from '@qoe/brand/native';
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { BRAND_LOGOS, BRAND_BADGES, BRAND_AVATAR_FALLBACKS, BRAND_SOCIAL_ICONS } from './paths';

export * from './paths';
export * from './avatars';
export * from './studio';

export interface NativeBrandProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export interface NativeCertifiedBadgeProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export interface NativeSocialIconProps {
  platform: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 🏷️ LogoSymbol (Native) — Glyphe « Q » officiel.
 */
export function LogoSymbol({ size = 28, width, height, color, style }: NativeBrandProps) {
  const { viewBox, path, defaultColor } = BRAND_LOGOS.symbol;
  const resolvedHeight = height ?? size;
  const resolvedWidth = width ?? Math.round(resolvedHeight * 1.624);
  const fillColor = color || defaultColor;

  return (
    <View style={[styles.center, style]}>
      <Svg width={resolvedWidth} height={resolvedHeight} viewBox={viewBox} fill="none">
        <Path d={path} fill={fillColor} />
      </Svg>
    </View>
  );
}

export const Logo = LogoSymbol;

/**
 * 🏷️ LogoWordmark (Native) — Logo typographique complet « qoe.fi ».
 * Remplace avantageusement les imports de fichiers SVG bruts dans le mobile header.
 */
export function LogoWordmark({
  size = 28,
  width,
  height,
  color = '#000000',
  style,
}: NativeBrandProps) {
  const { viewBox, path } = BRAND_LOGOS.wordmark;
  const resolvedHeight = height ?? size;
  const resolvedWidth = width ?? Math.round(resolvedHeight * 2.585);

  return (
    <View style={[styles.center, style]}>
      <Svg width={resolvedWidth} height={resolvedHeight} viewBox={viewBox} fill="none">
        <Path d={path} fill={color} fillRule="evenodd" />
      </Svg>
    </View>
  );
}

/**
 * 🏅 CertifiedBadge (Native) — Croix / Coche de certification officielle qoe.fi.
 * Fini les emojis ou les symboles iOS bleus : identité visuelle unifiée !
 */
export function CertifiedBadge({ size = 14, style }: NativeCertifiedBadgeProps) {
  const { viewBox, bgCircle, checkPath, checkColor, strokeWidth } = BRAND_BADGES.certified;

  return (
    <View style={[styles.center, style]}>
      <Svg width={size} height={size} viewBox={viewBox} fill="none">
        <Circle cx={bgCircle.cx} cy={bgCircle.cy} r={bgCircle.r} fill={bgCircle.color} />
        <Path
          d={checkPath}
          stroke={checkColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * 📰 MediaBadge (Native) — Badge média pour publications.
 */
export function MediaBadge({ size = 14, style }: NativeCertifiedBadgeProps) {
  const { viewBox, bgRect, iconPath, iconColor } = BRAND_BADGES.media;

  return (
    <View style={[styles.center, style]}>
      <Svg width={size} height={size} viewBox={viewBox} fill="none">
        <Rect
          x={bgRect.x}
          y={bgRect.y}
          width={bgRect.width}
          height={bgRect.height}
          rx={bgRect.rx}
          fill={bgRect.color}
        />
        <Path
          d={iconPath}
          stroke={iconColor}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * 🧑 UserSilhouette (Native) — Fallback d'avatar personnel.
 */
export function UserSilhouette({ size = 20, color = '#71717A', style }: NativeBrandProps) {
  const { viewBox, headCircle, bodyPath } = BRAND_AVATAR_FALLBACKS.userSilhouette;
  return (
    <View style={[styles.center, style]}>
      <Svg width={size} height={size} viewBox={viewBox} fill={color}>
        <Circle cx={headCircle.cx} cy={headCircle.cy} r={headCircle.r} />
        <Path d={bodyPath} />
      </Svg>
    </View>
  );
}

/**
 * 📰 MediaEmblem (Native) — Fallback d'avatar média.
 */
export function MediaEmblem({ size = 20, color = '#71717A', style }: NativeBrandProps) {
  const { viewBox, paths } = BRAND_AVATAR_FALLBACKS.mediaEmblem;
  return (
    <View style={[styles.center, style]}>
      <Svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d, index) => (
          <Path key={index} d={d} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * 🌐 SocialIcon (Native) — Icônes sociales compatibles React Native.
 */
export function SocialIcon({
  platform,
  size = 20,
  color = '#000000',
  style,
}: NativeSocialIconProps) {
  const key = platform.toLowerCase().trim();
  const icon = BRAND_SOCIAL_ICONS[key];

  if (!icon) {
    return (
      <View style={[styles.center, style]}>
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={2}
        >
          <Circle cx="12" cy="12" r="10" />
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.center, style]}>
      <Svg width={size} height={size} viewBox={icon.viewBox} fill={color}>
        <Path d={icon.path} fillRule={icon.fillRule || 'nonzero'} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
