import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDrawer } from '@/components/drawer/drawer-context';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

const BRAND = '#EE4B2B'; // vermillon — accent brand qoe.fi

export function Sidebar() {
  const theme = useTheme();
  const pathname = usePathname();
  const { closeDrawer } = useDrawer();
  const { session, signOut } = useAuth();

  const user = session?.user;
  const fullName = user?.user_metadata?.full_name as string | undefined;
  const displayName = fullName || user?.email?.split('@')[0] || 'Utilisateur';
  const initial = displayName.charAt(0).toUpperCase();

  const items = [
    {
      key: '/',
      label: t('sidebar.feed', 'Feed'),
      onPress: () => {
        closeDrawer();
        router.navigate('/');
      },
    },
    {
      key: '/explore',
      label: t('sidebar.explore', 'Explorer'),
      onPress: () => {
        closeDrawer();
        router.navigate('/explore');
      },
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.sidebar }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText style={styles.avatarText}>{initial}</ThemedText>
        </View>
        <ThemedText type="title" style={styles.wordmark}>
          Qoe
        </ThemedText>
      </View>

      <View style={styles.menu}>
        {items.map((item) => {
          const active = pathname === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}
            >
              {active ? <View style={[styles.activeBar, { backgroundColor: BRAND }]} /> : null}
              <ThemedText style={[styles.itemLabel, active && styles.itemLabelActive]}>
                {item.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.userRow}>
          <View
            style={[
              styles.avatar,
              styles.avatarSmall,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="small">{initial}</ThemedText>
          </View>
          <View style={styles.userMeta}>
            <ThemedText type="small" numberOfLines={1}>
              {displayName}
            </ThemedText>
            {user?.email ? (
              <ThemedText type="small" style={styles.handle} numberOfLines={1}>
                {user.email}
              </ThemedText>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.5 : 1 }]}
        >
          <ThemedText type="small">{t('auth.sign_out', 'Se déconnecter')}</ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Contenu moins collé au bord gauche — la sidebar occupe toute la
    // largeur, on la décale légèrement vers la droite.
    paddingHorizontal: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  wordmark: {
    fontSize: 22,
  },
  menu: {
    gap: Spacing.one,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  activeBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: Spacing.two,
  },
  itemLabel: {
    fontSize: 17,
  },
  itemLabelActive: {
    fontWeight: '700',
  },
  footer: {
    marginTop: 'auto',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  userMeta: {
    flex: 1,
  },
  handle: {
    opacity: 0.6,
  },
  signOut: {
    paddingVertical: Spacing.two,
  },
});
