// =====================================================================
// 🗂️ AppTabs — VARIANTE WEB des onglets (remplace app-tabs.tsx sur web)
// =====================================================================
// Sur le web, `NativeTabs` (expo-router/unstable-native-tabs) n'existe pas :
// on utilise l'API `expo-router/ui` (Tabs/TabList/TabTrigger/TabSlot) pour
// dessiner une barre d'onglets custom en haut de l'écran.
// =====================================================================

import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      {/* Route active pleine hauteur. */}
      <TabSlot style={{ height: '100%' }} />
      {/* Barre d'onglets custom (flottante en haut). */}
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Feed</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>Explorer</TabButton>
          </TabTrigger>
          <TabTrigger name="notifications" href="/notifications" asChild>
            <TabButton>Notifications</TabButton>
          </TabTrigger>
          <TabTrigger name="messages" href="/messages" asChild>
            <TabButton>Messages</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

// Bouton d'onglet : pastille arrondie (radius 16, padding 4/16).
export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}
      >
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

// Barre d'onglets : conteneur absolu pleine largeur (padding 16, centré),
export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        {/* Brand */}
        <ThemedText type="smallBold" style={styles.brandText}>
          Qoe
        </ThemedText>

        {props.children}

        {/* Lien Docs externe */}
        <ExternalLink href="https://qoe.fi" asChild>
          <Pressable style={styles.externalPressable}>
            <ThemedText type="link">Web</ThemedText>
            <SymbolView
              tintColor={colors.text}
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute', // flotte par-dessus le contenu
    width: '100%',
    padding: Spacing.three, // 16
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two, // 8
    paddingHorizontal: Spacing.four, // 24
    borderRadius: Spacing.five, // 32 (pastille arrondie)
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two, // 8
    maxWidth: MaxContentWidth, // 800
  },
  brandText: {
    marginRight: 'auto', // pousse le reste à droite
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one, // 4
    paddingHorizontal: Spacing.two, // 8
    borderRadius: Spacing.three, // 16
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one, // 4
    marginLeft: Spacing.two,
  },
});
