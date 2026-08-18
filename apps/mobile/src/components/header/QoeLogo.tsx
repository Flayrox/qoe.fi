import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

interface QoeLogoProps {
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
  const calculatedWidth = width ?? Math.round(height * 2.585);

  return (
    <View style={[styles.container, style]}>
      <Image
        source={require('@/../assets/images/qoefi_logo.svg')}
        style={{ width: calculatedWidth, height }}
        tintColor={color}
        contentFit="contain"
        accessibilityLabel="qoe.fi"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
