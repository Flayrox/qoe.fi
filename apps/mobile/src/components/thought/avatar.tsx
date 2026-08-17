import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// =====================================================================
// 👤 Avatar — image de profil (logoUrl) ou initiale sur fond neutre.
// Sizes : xs (28), sm (36), md (44), lg (56).
// =====================================================================

export interface AvatarUser {
  name?: string | null;
  username?: string | null;
  logoUrl?: string | null;
}

const SIZES = {
  xs: { size: 28, radius: 14, fontSize: 12 },
  sm: { size: 36, radius: 18, fontSize: 14 },
  md: { size: 44, radius: 22, fontSize: 17 },
  lg: { size: 56, radius: 28, fontSize: 22 },
} as const;

export type AvatarSize = keyof typeof SIZES;

export function Avatar({
  user,
  size = 'md',
  sizeNumber,
  showCertified = false,
}: {
  user: AvatarUser;
  size?: AvatarSize;
  /** Taille numérique exacte (px) — remplace `size`. */
  sizeNumber?: number;
  showCertified?: boolean;
}) {
  const theme = useTheme();
  const {
    size: px,
    radius,
    fontSize,
  } = sizeNumber
    ? { size: sizeNumber, radius: sizeNumber / 2, fontSize: Math.round(sizeNumber * 0.4) }
    : SIZES[size];

  const name = user?.name || user?.username || '?';
  const initial = name.charAt(0).toUpperCase();

  if (user?.logoUrl) {
    return (
      <View style={{ width: px, height: px }}>
        <Image
          source={{ uri: user.logoUrl }}
          style={{ width: px, height: px, borderRadius: radius }}
          contentFit="cover"
          transition={150}
        />
        {showCertified && user?.name ? (
          <View style={styles.certifiedBadge}>
            <ThemedText style={[styles.certifiedText, { fontSize: fontSize - 6 }]}>✓</ThemedText>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: px,
          height: px,
          borderRadius: radius,
          backgroundColor: theme.backgroundSelected,
        },
      ]}
    >
      <ThemedText style={{ fontSize, fontWeight: '600' }}>{initial}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  certifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ee4b2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  certifiedText: {
    color: '#ffffff',
    fontWeight: '700',
    lineHeight: 14,
  },
});
