import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { User, Newspaper } from 'lucide-react-native';
import { getAvatarTheme } from '@qoe/theme';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

// =====================================================================
// 👤 Avatar — Image de profil ou avatar vectoriel déterministe (Discord style 2026).
// Supporte :
// - Thèmes déterministes (Sakura, Matcha, Astral, Gazette, etc.)
// - Distinction stricte : Cercle pour Utilisateur vs Squircle pour Média
// Sizes : xs (28), sm (36), md (44), lg (56), xl (80).
// =====================================================================

export interface AvatarUser {
  name?: string | null;
  username?: string | null;
  logoUrl?: string | null;
  type?: 'PERSONAL' | 'MEDIA' | string | null;
}

export type AvatarShape = 'circle' | 'squircle';

const SIZES = {
  xs: { size: 28, fontSize: 12 },
  sm: { size: 36, fontSize: 14 },
  md: { size: 44, fontSize: 17 },
  lg: { size: 56, fontSize: 22 },
  xl: { size: 80, fontSize: 32 },
} as const;

export type AvatarSize = keyof typeof SIZES;

export function Avatar({
  user,
  size = 'md',
  sizeNumber,
  shape,
  type,
  showCertified = false,
}: {
  user: AvatarUser;
  size?: AvatarSize;
  /** Taille numérique exacte (px) — remplace `size`. */
  sizeNumber?: number;
  shape?: AvatarShape;
  type?: 'PERSONAL' | 'MEDIA' | string | null;
  showCertified?: boolean;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const px = sizeNumber || SIZES[size]?.size || 44;
  const isMedia = (type || user?.type) === 'MEDIA';
  const resolvedShape: AvatarShape = shape || (isMedia ? 'squircle' : 'circle');
  const radius = resolvedShape === 'circle' ? px / 2 : Math.round(px * 0.24);

  const seed = user?.username || user?.name || 'qoe-user';
  const theme = getAvatarTheme(seed, isMedia ? 'MEDIA' : 'PERSONAL');

  const bgColor = isDark ? theme.darkBg : theme.lightBg;
  const iconColor = isDark ? theme.darkIcon : theme.lightIcon;
  const borderColor = isDark ? theme.borderDark : theme.borderLight;
  const iconSize = Math.max(14, Math.round(px * (isMedia ? 0.48 : 0.52)));

  if (user?.logoUrl) {
    return (
      <View style={{ width: px, height: px, position: 'relative' }}>
        <Image
          source={{ uri: user.logoUrl }}
          style={{ width: px, height: px, borderRadius: radius }}
          contentFit="cover"
          transition={150}
        />
        {showCertified && user?.name ? (
          <View style={styles.certifiedBadge}>
            <ThemedText style={styles.certifiedText}>✓</ThemedText>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ width: px, height: px, position: 'relative' }}>
      <View
        style={[
          styles.fallback,
          {
            width: px,
            height: px,
            borderRadius: radius,
            backgroundColor: bgColor,
            borderColor: borderColor,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {isMedia ? (
          <Newspaper size={iconSize} color={iconColor} strokeWidth={1.8} />
        ) : (
          <User size={iconSize} color={iconColor} strokeWidth={2} />
        )}
      </View>

      {showCertified && user?.name ? (
        <View style={styles.certifiedBadge}>
          <ThemedText style={styles.certifiedText}>✓</ThemedText>
        </View>
      ) : null}
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
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ee4b2b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  certifiedText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 8,
    lineHeight: 10,
  },
});
