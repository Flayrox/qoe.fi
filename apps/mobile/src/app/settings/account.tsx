// =====================================================================
// 🧑 Route /settings/account — Informations du compte + mot de passe
// =====================================================================
// Parité web : email, type de compte, membre depuis, identifiant,
// changement de mot de passe (supabase/Go), session actuelle + déconnexion.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import {
  SettingsActionRow,
  SettingsFootnote,
  SettingsLinkRow,
  SettingsRowSeparator,
  SettingsScreenShell,
  SettingsSection,
} from '@/features/settings/settings-ui';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { playHaptic } from '@/lib/haptics';

const roleLabel = (role: string): string => {
  if (role === 'user') return t('settings.role_user', 'Lecteur');
  if (role === 'creator') return t('settings.role_creator', 'Créateur');
  if (role === 'admin') return t('settings.role_admin', 'Administrateur');
  if (role === 'superadmin') return t('settings.role_superadmin', 'Super administrateur');
  return role;
};

export default function AccountSettingsRoute() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const { data: me } = useQuery({
    queryKey: ['me', 'reader-profile'],
    queryFn: async () => {
      const res = await apiClient.getMe();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    staleTime: 60_000,
  });

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const email = me?.email ?? session?.user?.email ?? '';
  const createdAt = me?.createdAt
    ? new Date(me.createdAt)
    : session?.user?.created_at
      ? new Date(session.user.created_at)
      : null;

  const changePassword = async () => {
    if (next.length < 12) {
      setMessage({
        type: 'err',
        text: t(
          'settings.password_min',
          'Le nouveau mot de passe doit contenir au moins 12 caractères.'
        ),
      });
      return;
    }
    if (next !== confirm) {
      setMessage({
        type: 'err',
        text: t('settings.password_mismatch', 'Les mots de passe ne correspondent pas.'),
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await apiClient.changePassword(current, next);
    setBusy(false);
    if (!res.ok) {
      playHaptic('Heavy');
      setMessage({ type: 'err', text: res.error });
      return;
    }
    playHaptic('Success');
    setCurrent('');
    setNext('');
    setConfirm('');
    setMessage({ type: 'ok', text: t('settings.password_updated', 'Mot de passe mis à jour.') });
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
  ];

  return (
    <SettingsScreenShell title={t('settings.account', 'Compte')}>
      <SettingsSection title={t('settings.account_info', 'Informations')}>
        <View style={styles.infoGrid}>
          <View style={[styles.infoField, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t('settings.email', 'Adresse email')}
            </ThemedText>
            <ThemedText style={styles.infoValue} numberOfLines={1}>
              {email}
            </ThemedText>
          </View>
          <View style={[styles.infoField, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t('settings.account_type', 'Type de compte')}
            </ThemedText>
            <ThemedText style={styles.infoValue} numberOfLines={1}>
              {me?.role ? roleLabel(me.role) : '—'}
            </ThemedText>
          </View>
          <View style={[styles.infoField, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t('settings.member_since', 'Membre depuis')}
            </ThemedText>
            <ThemedText style={styles.infoValue} numberOfLines={1}>
              {createdAt
                ? createdAt.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '—'}
            </ThemedText>
          </View>
          <View style={[styles.infoField, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t('settings.identifier', 'Identifiant')}
            </ThemedText>
            <ThemedText style={styles.infoValue} numberOfLines={1}>
              {me?.id ? `${me.id.slice(0, 12)}…` : '—'}
            </ThemedText>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.password', 'Mot de passe')}>
        <View style={styles.passwordBlock}>
          <View style={styles.field}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {t('settings.current_password', 'Mot de passe actuel')}
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={current}
              onChangeText={setCurrent}
              placeholder="••••••••"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {t('settings.new_password', 'Nouveau mot de passe')}
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={next}
              onChangeText={setNext}
              placeholder={t('settings.password_placeholder', '12 caractères minimum')}
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {t('settings.confirm_password', 'Confirmer le mot de passe')}
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••••"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={() => void changePassword()}
            />
          </View>
          {message ? (
            <ThemedText
              type="small"
              style={{ color: message.type === 'ok' ? theme.success : theme.destructive }}
            >
              {message.text}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => void changePassword()}
            disabled={busy}
            style={({ pressed }) => [
              styles.submit,
              {
                backgroundColor: pressed ? theme.backgroundSelected : theme.primary,
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            <ThemedText style={styles.submitText}>
              {busy
                ? t('settings.saving', 'Enregistrement…')
                : t('settings.change_password', 'Changer le mot de passe')}
            </ThemedText>
          </Pressable>
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.session', 'Session')}>
        <View>
          <SettingsLinkRow
            icon={{
              ios: 'person.crop.circle.badge.plus',
              android: 'person_add',
              web: 'person_add',
            }}
            label={t('settings.manage_accounts', 'Gérer les comptes')}
            description={t(
              'settings.manage_accounts_desc',
              'Basculer, ajouter ou retirer un compte'
            )}
            onPress={() => router.push('/settings/accounts')}
          />
          <SettingsRowSeparator />
          <SettingsLinkRow
            icon={{ ios: 'lock.shield', android: 'security', web: 'security' }}
            label={t('settings.security', 'Sécurité')}
            description={t('settings.security_desc', '2FA, sessions, fournisseurs connectés')}
            onPress={() => router.push('/settings/security')}
          />
          <SettingsRowSeparator />
          <SettingsActionRow
            label={t('auth.sign_out', 'Se déconnecter')}
            destructive
            onPress={() => void signOut()}
          />
        </View>
        <SettingsFootnote>
          {t('settings.session_footnote', 'Connecté avec {email}', { email })}
        </SettingsFootnote>
      </SettingsSection>
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  infoField: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  passwordBlock: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  field: {
    gap: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 15,
  },
  submit: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 13,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
