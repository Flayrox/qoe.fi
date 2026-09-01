// =====================================================================
// 🖼️ Lightbox — Visionneuse plein écran (port de
//    .reference/bluesky/src/components/Lightbox/Lightbox.tsx)
// =====================================================================
// Modal plein écran avec zoom (ScrollView pinch) + fermeture. Adapté
// sans react-native-svg : pas de pager, zoom via maximumZoomScale natif.
// =====================================================================

import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function Lightbox({
  visible,
  uri,
  alt,
  onClose,
}: {
  visible: boolean;
  uri: string;
  alt?: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [showAlt, setShowAlt] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
        >
          <Pressable onPress={onClose} style={styles.imageWrap}>
            <Image source={{ uri }} style={styles.image} contentFit="contain" transition={100} />
          </Pressable>
        </ScrollView>

        {/* Barre supérieure : alt + fermer */}
        <View style={styles.topBar}>
          {alt ? (
            <Pressable onPress={() => setShowAlt((v) => !v)} hitSlop={8}>
              <ThemedText type="small" style={{ color: '#fff' }}>
                ALT
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={22}
              tintColor="#ffffff"
              weight="semibold"
            />
          </Pressable>
        </View>

        {showAlt && alt ? (
          <View style={[styles.altBar, { backgroundColor: theme.background }]}>
            <ThemedText type="small">{alt}</ThemedText>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** Hook util : état d'ouverture de la lightbox. */
export function useLightbox() {
  const [state, setState] = useState<{ uri: string; alt?: string | null } | null>(null);
  return {
    open: (uri: string, alt?: string | null) => setState({ uri, alt }),
    close: () => setState(null),
    props: state,
  };
}

export function LightboxHost({
  state,
  onClose,
}: {
  state: { uri: string; alt?: string | null } | null;
  onClose: () => void;
}) {
  return state ? (
    <Lightbox visible={!!state} uri={state.uri} alt={state.alt} onClose={onClose} />
  ) : null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  altBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 12,
  },
});
