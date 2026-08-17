// =====================================================================
// 🏷️ WebBadge — Badge « Expo » + version (rendu UNIQUEMENT sur web,
//    cf. explore.tsx : `{Platform.OS === 'web' && <WebBadge />}`).
// =====================================================================

import { version } from 'expo/package.json';
import { Image } from 'expo-image';
import { useColorScheme, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';

export function WebBadge() {
  const scheme = useColorScheme();

  return (
    <ThemedView style={styles.container}>
      {/* Version Expo affichée en police mono, texte secondaire. */}
      <ThemedText type="code" themeColor="textSecondary" style={styles.versionText}>
        v{version}
      </ThemedText>
      {/* Badge image : version blanche en dark, noire en light. */}
      <Image
        source={
          scheme === 'dark'
            ? require('@/assets/images/expo-badge-white.png')
            : require('@/assets/images/expo-badge.png')
        }
        style={styles.badgeImage}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.five, // 32
    alignItems: 'center',
    gap: Spacing.two, // 8
  },
  versionText: {
    textAlign: 'center',
  },
  // Badge 123px de large, ratio 123/24 (hauteur ≈ 24px).
  badgeImage: {
    width: 123,
    aspectRatio: 123 / 24,
  },
});
