// =====================================================================
// 👥 Route /settings/accounts — Comptes & sessions multi-comptes
// =====================================================================
// Gère les comptes sauvegardés (switch, ajout, retrait, déconnexion),
// façon compte X : bascule instantanée entre identités.
// =====================================================================

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/thought/avatar';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Toast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { AddAccountModal } from '@/features/auth/add-account-modal';
import { useAuth } from '@/features/auth/auth-provider';
import {
  SettingsActionRow,
  SettingsLinkRow,
  SettingsRowSeparator,
  SettingsScreenShell,
  SettingsSection,
} from '@/features/settings/settings-ui';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export default function AccountsSettingsRoute() {
  const theme = useTheme();
  const { session, savedAccounts, switchAccount, removeAccount, signOutAll } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountMode, setAddAccountMode] = useState<'signin' | 'signup'>('signin');
  const [menuAccountId, setMenuAccountId] = useState<string | null>(null);

  const currentUserId = session?.user?.id;

  const handleSwitch = async (accountId: string) => {
    if (accountId === currentUserId || busyId) return;
    setBusyId(accountId);
    const ok = await switchAccount(accountId);
    setBusyId(null);
    if (!ok) {
      Toast.show(t('account.switch_error', 'Impossible de basculer sur ce compte'), 'error');
    }
  };

  const handleRemove = async (accountId: string) => {
    setMenuAccountId(null);
    setBusyId(accountId);
    await removeAccount(accountId);
    setBusyId(null);
  };

  const openSignin = () => {
    setAddAccountMode('signin');
    setAddAccountOpen(true);
  };
  const openSignup = () => {
    setAddAccountMode('signup');
    setAddAccountOpen(true);
  };

  const menuAccount = savedAccounts.find((a) => a.id === menuAccountId);

  return (
    <SettingsScreenShell
      title={t('settings.accounts', 'Comptes & sessions')}
      subtitle={t('settings.accounts_subtitle', 'Basculez entre vos identités')}
    >
      <SettingsSection title={t('settings.accounts_saved', 'Comptes enregistrés')}>
        <View>
          {savedAccounts.map((account, index) => {
            const isCurrent = account.id === currentUserId;
            return (
              <View key={account.id}>
                {index > 0 ? <SettingsRowSeparator /> : null}
                <Pressable
                  onPress={() => void handleSwitch(account.id)}
                  disabled={busyId !== null}
                  style={({ pressed }) => [
                    styles.accountRow,
                    { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                  ]}
                >
                  <Avatar
                    user={{
                      name: account.name,
                      username: account.username,
                      logoUrl: account.avatarUrl,
                    }}
                    sizeNumber={40}
                    showCertified={account.isCertified}
                  />
                  <View style={styles.accountBody}>
                    <ThemedText style={styles.accountName} numberOfLines={1}>
                      {account.name}
                    </ThemedText>
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                      numberOfLines={1}
                    >
                      @{account.username || account.email.split('@')[0]}
                    </ThemedText>
                  </View>
                  {busyId === account.id ? (
                    <ActivityIndicator size="small" color={theme.textSecondary} />
                  ) : isCurrent ? (
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>
                      {t('settings.current', 'Actif')}
                    </ThemedText>
                  ) : (
                    <Pressable
                      onPress={() => setMenuAccountId(account.id)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.menuBtn, { opacity: pressed ? 0.5 : 1 }]}
                    >
                      <ThemedText
                        style={{ color: theme.textSecondary, fontSize: 18, fontWeight: '700' }}
                      >
                        ⋯
                      </ThemedText>
                    </Pressable>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.accounts_add', 'Ajouter')}>
        <View>
          <SettingsLinkRow
            icon={{ ios: 'plus', android: 'add', web: 'add' }}
            label={t('account.add_existing_btn', 'Ajouter un compte existant')}
            onPress={openSignin}
          />
          <SettingsRowSeparator />
          <SettingsLinkRow
            icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
            label={t('account.create_new_btn', 'Créer un nouveau compte')}
            onPress={openSignup}
          />
        </View>
      </SettingsSection>

      {savedAccounts.length > 1 ? (
        <SettingsSection>
          <SettingsActionRow
            label={t('auth.sign_out_all', 'Se déconnecter de tous les comptes')}
            destructive
            onPress={() => void signOutAll()}
          />
        </SettingsSection>
      ) : null}

      {/* Menu d'actions d'un compte secondaire */}
      <ActionSheet
        visible={menuAccount !== undefined}
        title={
          menuAccount
            ? `${menuAccount.name} (@${menuAccount.username || menuAccount.email.split('@')[0]})`
            : ''
        }
        onClose={() => setMenuAccountId(null)}
        groups={[
          {
            items: menuAccount
              ? [
                  {
                    key: 'switch',
                    label: t('settings.switch_here', 'Basculer sur ce compte'),
                    icon: {
                      ios: 'arrow.left.arrow.right',
                      android: 'swap_horiz',
                      web: 'swap_horiz',
                    },
                    onPress: () => {
                      const id = menuAccount.id;
                      setMenuAccountId(null);
                      void handleSwitch(id);
                    },
                  },
                  {
                    key: 'remove',
                    label: t('settings.remove_account', 'Retirer ce compte de l’appareil'),
                    destructive: true,
                    icon: { ios: 'trash', android: 'delete', web: 'delete' },
                    onPress: () => void handleRemove(menuAccount.id),
                  },
                ]
              : [],
          },
        ]}
      />

      <AddAccountModal
        visible={addAccountOpen}
        initialMode={addAccountMode}
        onClose={() => setAddAccountOpen(false)}
      />
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  accountBody: {
    flex: 1,
    gap: 1,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '600',
  },
  menuBtn: {
    padding: 6,
  },
});
