import * as WebBrowser from 'expo-web-browser';
import { router, usePathname } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDrawer } from '@/components/drawer/drawer-context';
import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/thought/avatar';
import { ActionSheet, type ActionSheetGroup } from '@/components/ui/action-sheet';
import { Toast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { AddAccountModal } from '@/features/auth/add-account-modal';
import { useAuth } from '@/features/auth/auth-provider';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';

interface NavItem {
  key: string;
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  badge?: string;
}

export function Sidebar() {
  const theme = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { closeDrawer } = useDrawer();
  const {
    session,
    signOut,
    signOutAll,
    savedAccounts,
    switchAccount,
    removeAccount,
    updateCurrentAccountMeta,
  } = useAuth();
  const { data: me } = useMe();

  const sidebarWidth = width * 0.72;

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [addAccountModalOpen, setAddAccountModalOpen] = useState(false);
  const [addAccountMode, setAddAccountMode] = useState<'signin' | 'signup'>('signin');

  const user = session?.user;
  const currentUserId = user?.id;
  const fullName = me?.name || (user?.user_metadata?.full_name as string | undefined);
  const username = me?.username || (user?.user_metadata?.username as string | undefined);
  const profileHandle = username || me?.publicationId || user?.id || 'me';
  const displayHandle = username || user?.email?.split('@')[0] || 'me';
  const displayName = fullName || username || user?.email?.split('@')[0] || 'Utilisateur';

  // Synchroniser les métadonnées complètes du compte actuel (avatar, certif, name)
  useEffect(() => {
    if (me && session) {
      updateCurrentAccountMeta({
        name: me.name || undefined,
        username: me.username || undefined,
        avatarUrl: me.logoUrl || undefined,
        isCertified: me.isCertified,
      });
    }
  }, [me, session, updateCurrentAccountMeta]);

  // Autres comptes enregistrés (excluant le compte actif)
  const secondaryAccounts = savedAccounts.filter((a) => a.id !== currentUserId);

  const followingCount = me?.stats?.followingCount ?? 0;
  const followersCount = me?.stats?.followersCount ?? 0;
  const walletBalanceEuros = ((me?.walletBalanceCents ?? 0) / 100).toFixed(2);

  const openProfile = () => {
    closeDrawer();
    router.push({ pathname: '/user/[username]', params: { username: profileHandle } });
  };

  const openFollowing = () => {
    closeDrawer();
    router.push({
      pathname: '/user/[username]/follow',
      params: { username: profileHandle, tab: 'following' },
    });
  };

  const openFollowers = () => {
    closeDrawer();
    router.push({
      pathname: '/user/[username]/follow',
      params: { username: profileHandle, tab: 'followers' },
    });
  };

  const openSupport = () => {
    closeDrawer();
    void WebBrowser.openBrowserAsync('https://qoe.fi/support');
  };

  const handleSwitchAccount = async (targetId: string) => {
    playHaptic('Light');
    const success = await switchAccount(targetId);
    if (!success) {
      Toast.show(t('account.switch_error', 'Impossible de basculer sur ce compte'), 'error');
    }
  };

  const isCreatorOrAdmin = me?.role === 'ADMIN' || me?.role === 'creator';

  const mainItems: NavItem[] = [
    {
      key: 'profile',
      label: t('sidebar.profile', 'Profil'),
      icon: { ios: 'person', android: 'person', web: 'person' },
      onPress: openProfile,
    },
    ...(isCreatorOrAdmin
      ? [
          {
            key: 'creator_dashboard',
            label: t('sidebar.creator_dashboard', 'Studio Créateur'),
            icon: {
              ios: 'chart.bar.xaxis',
              android: 'analytics',
              web: 'analytics',
            } as SymbolViewProps['name'],
            onPress: () => {
              closeDrawer();
              Toast.show(
                t('sidebar.creator_dashboard_ready', 'Ouverture du Studio Créateur...'),
                'info'
              );
              void WebBrowser.openBrowserAsync('https://qoe.fi/dashboard');
            },
          },
        ]
      : []),
    {
      key: '/notifications',
      label: t('sidebar.notifications', 'Notifications'),
      icon: { ios: 'bell', android: 'notifications', web: 'notifications' },
      onPress: () => {
        closeDrawer();
        router.push('/notifications');
      },
    },
    {
      key: '/library',
      label: t('sidebar.library', 'Bibliothèque'),
      icon: { ios: 'bookmark', android: 'bookmark', web: 'bookmark' },
      onPress: () => {
        closeDrawer();
        router.push('/library');
      },
    },
    {
      key: 'wallet',
      label: t('sidebar.wallet', 'Portefeuille'),
      icon: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
      badge: `${walletBalanceEuros} €`,
      onPress: () => {
        setWalletSheetOpen(true);
      },
    },
  ];

  const bottomItems: NavItem[] = [
    {
      key: 'settings',
      label: t('sidebar.settings', 'Paramètres et confidentialité'),
      icon: { ios: 'gearshape', android: 'settings', web: 'settings' },
      onPress: () => {
        closeDrawer();
        Toast.show(t('sidebar.settings_coming_soon', 'Paramètres bientôt disponibles'), 'info');
      },
    },
    {
      key: 'support',
      label: t('sidebar.support', 'Centre d’aide & Support'),
      icon: { ios: 'questionmark.circle', android: 'help', web: 'help' },
      onPress: openSupport,
    },
  ];

  // Groupes pour l'ActionSheet des comptes (style X)
  const accountActionGroups: ActionSheetGroup[] = [
    {
      // Liste de tous les comptes enregistrés
      items: savedAccounts.map((acc) => {
        const isCurrent = acc.id === currentUserId;
        return {
          key: `acc_${acc.id}`,
          label: `${acc.name} (@${acc.username})`,
          icon: {
            ios: isCurrent ? 'checkmark.circle.fill' : 'circle',
            android: isCurrent ? 'check_circle' : 'radio_button_unchecked',
            web: isCurrent ? 'check_circle' : 'radio_button_unchecked',
          },
          right: acc.avatarUrl ? (
            <Avatar
              user={{ name: acc.name, username: acc.username, logoUrl: acc.avatarUrl }}
              sizeNumber={24}
              showCertified={acc.isCertified}
            />
          ) : undefined,
          onPress: () => {
            setAccountMenuOpen(false);
            if (!isCurrent) {
              void handleSwitchAccount(acc.id);
            }
          },
        };
      }),
    },
    {
      items: [
        {
          key: 'add_existing_account',
          label: t('account.add_existing_btn', 'Ajouter un compte existant'),
          icon: { ios: 'plus', android: 'add', web: 'add' },
          onPress: () => {
            setAccountMenuOpen(false);
            setAddAccountMode('signin');
            setAddAccountModalOpen(true);
          },
        },
        {
          key: 'create_new_account',
          label: t('account.create_new_btn', 'Créer un nouveau compte'),
          icon: { ios: 'person.badge.plus', android: 'person_add', web: 'person_add' },
          onPress: () => {
            setAccountMenuOpen(false);
            setAddAccountMode('signup');
            setAddAccountModalOpen(true);
          },
        },
      ],
    },
    {
      items: [
        {
          key: 'sign_out_current',
          label: t('auth.sign_out_user', 'Se déconnecter de @%{handle}', {
            handle: displayHandle,
          }),
          destructive: true,
          icon: {
            ios: 'rectangle.portrait.and.arrow.right',
            android: 'logout',
            web: 'logout',
          } as const,
          onPress: () => {
            setAccountMenuOpen(false);
            if (currentUserId) {
              void removeAccount(currentUserId);
            } else {
              void signOut();
            }
          },
        },
        ...(savedAccounts.length > 1
          ? [
              {
                key: 'sign_out_all',
                label: t('auth.sign_out_all', 'Se déconnecter de tous les comptes'),
                destructive: true,
                icon: {
                  ios: 'rectangle.portrait.and.arrow.right',
                  android: 'logout',
                  web: 'logout',
                } as const,
                onPress: () => {
                  setAccountMenuOpen(false);
                  closeDrawer();
                  void signOutAll();
                },
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.sidebar, width: sidebarWidth }]}
    >
      {/* ─── En-tête : Avatar principal + Mini-avatars des autres comptes & bouton ⋯ (façon X) ─── */}
      <View style={styles.topRow}>
        <Pressable onPress={openProfile} hitSlop={8}>
          <Avatar
            user={{
              name: displayName,
              username: profileHandle,
              logoUrl: me?.logoUrl || (user?.user_metadata?.avatar_url as string | undefined),
            }}
            sizeNumber={44}
            showCertified={me?.isCertified}
          />
        </Pressable>

        {/* Switchers rapides des comptes secondaires + Bouton menu ⋯ */}
        <View style={styles.accountSwitchersRow}>
          {secondaryAccounts.slice(0, 2).map((acc) => (
            <Pressable
              key={acc.id}
              onPress={() => handleSwitchAccount(acc.id)}
              style={({ pressed }) => [styles.secondaryAvatarWrap, { opacity: pressed ? 0.6 : 1 }]}
              hitSlop={6}
            >
              <Avatar
                user={{
                  name: acc.name,
                  username: acc.username,
                  logoUrl: acc.avatarUrl,
                }}
                sizeNumber={32}
                showCertified={acc.isCertified}
              />
            </Pressable>
          ))}

          {/* Bouton Options / Gestion des comptes ⋯ */}
          <Pressable
            onPress={() => {
              playHaptic('Light');
              setAccountMenuOpen(true);
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.optionsButton,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}
          >
            <SymbolView
              name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
              size={18}
              tintColor={theme.text}
              weight="medium"
            />
          </Pressable>
        </View>
      </View>

      {/* ─── Identité : Nom, @handle & Badges ─── */}
      <Pressable onPress={openProfile} style={styles.identitySection}>
        <View style={styles.nameRow}>
          <ThemedText style={styles.displayName} numberOfLines={1}>
            {displayName}
          </ThemedText>
          {me?.isCertified ? (
            <View style={styles.certifiedBadgeInline}>
              <ThemedText style={styles.certifiedTextInline}>✓</ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText style={[styles.handle, { color: theme.textSecondary }]} numberOfLines={1}>
          @{displayHandle}
        </ThemedText>
      </Pressable>

      {/* ─── Compteurs : Abonnements & Abonnés ─── */}
      <View style={styles.statsRow}>
        <Pressable onPress={openFollowing} hitSlop={6} style={styles.statTouch}>
          <ThemedText style={styles.statNumber}>{followingCount}</ThemedText>
          <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
            {' '}
            {t('profile.following_label', 'Abonnements')}
          </ThemedText>
        </Pressable>

        <Pressable onPress={openFollowers} hitSlop={6} style={styles.statTouch}>
          <ThemedText style={styles.statNumber}>{followersCount}</ThemedText>
          <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
            {' '}
            {t('profile.followers_label', 'Abonnés')}
          </ThemedText>
        </Pressable>
      </View>

      {/* ─── Menu Principal : Profil, Bibliothèque, Portefeuille ─── */}
      <View style={styles.mainNav}>
        {mainItems.map((item) => {
          const isActive = pathname === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.navItem,
                {
                  backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View style={styles.navIconContainer}>
                <SymbolView
                  name={item.icon}
                  size={24}
                  tintColor={isActive ? theme.primary : theme.text}
                  weight="medium"
                />
              </View>
              <ThemedText
                style={[
                  styles.navLabel,
                  { color: isActive ? theme.primary : theme.text },
                  isActive && styles.navLabelActive,
                ]}
              >
                {item.label}
              </ThemedText>
              {item.badge ? (
                <View
                  style={[
                    styles.walletBadge,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <ThemedText style={[styles.walletBadgeText, { color: theme.textSecondary }]}>
                    {item.badge}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* ─── Séparateur Hairline ─── */}
      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* ─── Section Basse : Paramètres & Support ─── */}
      <View style={styles.bottomNav}>
        {bottomItems.map((item) => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.bottomNavItem,
              {
                backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={styles.navIconContainer}>
              <SymbolView
                name={item.icon}
                size={22}
                tintColor={theme.textSecondary}
                weight="regular"
              />
            </View>
            <ThemedText style={[styles.bottomNavLabel, { color: theme.text }]}>
              {item.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* ─── ActionSheet : Gestion de comptes façon X ─── */}
      <ActionSheet
        visible={accountMenuOpen}
        title={t('account.accounts_title', 'Comptes')}
        onClose={() => setAccountMenuOpen(false)}
        groups={accountActionGroups}
      />

      {/* ─── ActionSheet : Portefeuille ─── */}
      <ActionSheet
        visible={walletSheetOpen}
        title={t('wallet.title', 'Portefeuille Qoe')}
        onClose={() => setWalletSheetOpen(false)}
        groups={[
          {
            items: [
              {
                key: 'balance',
                label: `${t('wallet.current_balance', 'Solde disponible')} : ${walletBalanceEuros} €`,
                icon: { ios: 'banknote', android: 'payments', web: 'payments' },
                onPress: () => {},
              },
              {
                key: 'history',
                label: t('wallet.earnings_history', 'Historique & Rémunération créateur'),
                icon: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
                onPress: () => {
                  setWalletSheetOpen(false);
                  closeDrawer();
                  void WebBrowser.openBrowserAsync('https://qoe.fi/dashboard/wallet');
                },
              },
            ],
          },
        ]}
      />

      {/* ─── Modale d'ajout de compte existant / création ─── */}
      <AddAccountModal
        visible={addAccountModalOpen}
        initialMode={addAccountMode}
        onClose={() => setAddAccountModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  accountSwitchersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryAvatarWrap: {
    padding: 2,
  },
  optionsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySection: {
    marginTop: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  displayName: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  certifiedBadgeInline: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#ee4b2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  certifiedTextInline: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
  handle: {
    fontSize: 14,
    marginTop: 1,
    letterSpacing: -0.1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
    marginBottom: 10,
  },
  statTouch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 14,
  },
  mainNav: {
    marginTop: 18,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 14,
  },
  navIconContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
  },
  navLabelActive: {
    fontWeight: '800',
  },
  walletBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  walletBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 20,
    marginBottom: 14,
    marginHorizontal: 4,
  },
  bottomNav: {
    gap: 4,
  },
  bottomNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 14,
  },
  bottomNavLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
