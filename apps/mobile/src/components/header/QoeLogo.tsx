// ═══════════════════════════════════════════════════════════════════
// 📱 apps/mobile — QoeLogo.tsx (Délégué vers @qoe/brand/native)
// Rendu vectoriel natif universel (react-native-svg) sans require local.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { LogoWordmark } from '@qoe/brand/native';

export interface QoeLogoProps {
  /** Hauteur en pixels du logo (la largeur s'adapte automatiquement au ratio ~2.58) */
  height?: number;
  /** Largeur personnalisée (si non spécifiée, calculée automatiquement) */
  width?: number;
  /** Teinte du logo (#000000 noir par défaut) */
  color?: string;
  /** Style personnalisé pour le conteneur */
  style?: StyleProp<ViewStyle>;
}

export function QoeLogo({ height = 28, width, color = '#000000', style }: QoeLogoProps) {
  return <LogoWordmark height={height} width={width} color={color} style={style} />;
}
