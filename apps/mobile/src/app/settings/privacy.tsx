// =====================================================================
// 🛡️ Route /settings/privacy — Confidentialité
// =====================================================================
// Parité web : visibilité du profil, mentions, invitations de collab,
// contenus sensibles, visibilité des likes, mots masqués, contrôles
// sociaux (utilisateurs bloqués / masqués).
// =====================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import {
  SettingsFootnote,
  SettingsRowSeparator,
  SettingsScreenShell,
  SettingsSection,
  SettingsSelectRow,
  SettingsToggleRow,
} from '@/features/settings/settings-ui';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { playHaptic } from '@/lib/haptics';

export default function PrivacySettingsRoute() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [mutedInput, setMutedInput] = useState('');
  const [wordsBusy, setWordsBusy] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['settings', 'user-settings'],
    queryFn: async () => {
      const res = await apiClient.getUserSettings();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    staleTime: 60_000,
  });

  const { data: mutedWords } = useQuery({
    queryKey: ['settings', 'muted-words'],
    queryFn: async () => {
      const res = await apiClient.getMutedWords();
      if (!res.ok) throw new Error(res.error);
      return res.data.words;
    },
    staleTime: 60_000,
  });

  const { data: social } = useQuery({
    queryKey: ['settings', 'social-controls'],
    queryFn: async () => {
      const [blocked, muted] = await Promise.all([
        apiClient.getBlockedUsers(),
        apiClient.getMutedUsers(),
      ]);
      return {
        blocked: blocked.ok ? blocked.data.users : [],
        muted: muted.ok ? muted.data.users : [],
      };
    },
    staleTime: 60_000,
  });

  const patch = async (input: Record<string, unknown>) => {
    try {
      const res = await apiClient.updateUserSettings(input as never);
      if (!res.ok) throw new Error(res.error);
      await queryClient.invalidateQueries({ queryKey: ['settings', 'user-settings'] });
    } catch (err) {
      Toast.show(
        err instanceof Error
          ? err.message
          : t('settings.save_error', 'Impossible d’enregistrer ce réglage'),
        'error'
      );
    }
  };

  const addMutedWord = async () => {
    const word = mutedInput.trim().toLowerCase();
    if (!word || wordsBusy) return;
    setWordsBusy(true);
    const res = await apiClient.toggleMutedWord(word);
    setWordsBusy(false);
    if (!res.ok) {
      Toast.show(res.error, 'error');
      return;
    }
    playHaptic('Light');
    setMutedInput('');
    await queryClient.invalidateQueries({ queryKey: ['settings', 'muted-words'] });
  };

  const removeMutedWord = async (word: string) => {
    const res = await apiClient.toggleMutedWord(word);
    if (!res.ok) {
      Toast.show(res.error, 'error');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['settings', 'muted-words'] });
  };

  const toggleSocial = async (kind: 'blocked' | 'muted', userId: string) => {
    const res =
      kind === 'blocked'
        ? await apiClient.toggleBlockedUser(userId)
        : await apiClient.toggleMutedUser(userId);
    if (!res.ok) {
      Toast.show(res.error, 'error');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['settings', 'social-controls'] });
  };

  const chipLabel = (u: { name: string | null; username: string | null }) =>
    u.name || u.username || '';

  return (
    <SettingsScreenShell
      title={t('settings.privacy', 'Confidentialité')}
      subtitle={t(
        'settings.privacy_subtitle',
        'Qui peut vous trouver, vous mentionner, vous inviter'
      )}
    >
      <SettingsSection title={t('settings.privacy_profile', 'Profil & interactions')}>
        <View>
          <SettingsSelectRow
            label={t('settings.profile_visibility', 'Visibilité du profil')}
            description={t(
              'settings.profile_visibility_desc',
              'Contrôle la visibilité de votre profil public'
            )}
            value={settings?.profileVisibility ?? 'PUBLIC'}
            options={[
              { value: 'PUBLIC', label: t('settings.visibility_public', 'Public') },
              {
                value: 'FOLLOWERS',
                label: t('settings.visibility_followers', 'Abonnés uniquement'),
              },
              { value: 'PRIVATE', label: t('settings.visibility_private', 'Privé') },
            ]}
            onChange={(value) => void patch({ profileVisibility: value })}
          />
          <SettingsRowSeparator />
          <SettingsToggleRow
            label={t('settings.allow_mentions', 'Autoriser les mentions')}
            description={t(
              'settings.allow_mentions_desc',
              'Les autres membres peuvent vous mentionner dans une pensée'
            )}
            value={settings?.allowMentions ?? true}
            onChange={(value) => void patch({ allowMentions: value })}
          />
          <SettingsRowSeparator />
          <SettingsToggleRow
            label={t('settings.allow_invites', 'Recevoir les invitations de collaboration')}
            description={t(
              'settings.allow_invites_desc',
              'Les auteurs peuvent vous proposer d’être cité dans un article'
            )}
            value={settings?.allowCollaborationInvites ?? true}
            onChange={(value) => void patch({ allowCollaborationInvites: value })}
          />
          <SettingsRowSeparator />
          <SettingsToggleRow
            label={t('settings.sensitive', 'Afficher les contenus sensibles')}
            description={t(
              'settings.sensitive_desc',
              'Contrôle l’affichage des avertissements de contenu'
            )}
            value={settings?.showSensitiveContent ?? false}
            onChange={(value) => void patch({ showSensitiveContent: value })}
          />
          <SettingsRowSeparator />
          <SettingsSelectRow
            label={t('settings.likes_visibility', 'Visibilité de mes likes')}
            description={t(
              'settings.likes_visibility_desc',
              'Apparaissez-vous dans les listes des personnes ayant aimé ?'
            )}
            value={settings?.likeVisibility ?? 'PUBLIC'}
            options={[
              { value: 'PUBLIC', label: t('settings.likes_public', 'Publique') },
              { value: 'PRIVATE', label: t('settings.likes_private', 'Privée') },
            ]}
            onChange={(value) => void patch({ likeVisibility: value })}
          />
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.muted_words', 'Mots masqués')}>
        <View style={styles.mutedWrap}>
          <View style={styles.mutedInputRow}>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              value={mutedInput}
              onChangeText={setMutedInput}
              placeholder={t('settings.muted_placeholder', 'Ajouter un mot à masquer')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => void addMutedWord()}
            />
            <Pressable
              onPress={() => void addMutedWord()}
              disabled={wordsBusy || !mutedInput.trim()}
              style={({ pressed }) => [
                styles.addBtn,
                {
                  backgroundColor: pressed ? theme.backgroundSelected : theme.primary,
                  opacity: wordsBusy || !mutedInput.trim() ? 0.5 : 1,
                },
              ]}
            >
              <ThemedText style={styles.addBtnText}>{t('common.add', 'Ajouter')}</ThemedText>
            </Pressable>
          </View>
          {mutedWords && mutedWords.length > 0 ? (
            <View style={styles.chips}>
              {mutedWords.map((word) => (
                <Pressable
                  key={word}
                  onPress={() => void removeMutedWord(word)}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <ThemedText type="small" style={styles.chipText}>
                    {word} ✕
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {t('settings.muted_empty', 'Aucun mot masqué pour le moment.')}
            </ThemedText>
          )}
          <SettingsFootnote>
            {t(
              'settings.muted_footnote',
              'Le contenu contenant ces mots sera filtré de votre fil et de vos recommandations.'
            )}
          </SettingsFootnote>
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.social_controls', 'Contrôles sociaux')}>
        <View>
          <View style={styles.socialRow}>
            <ThemedText type="smallBold">
              {t('settings.blocked_users', 'Utilisateurs bloqués')}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {social?.blocked.length ?? 0}
            </ThemedText>
          </View>
          {social && social.blocked.length > 0 ? (
            <View style={styles.chips}>
              {social.blocked.map((user) => (
                <Pressable
                  key={`b-${user.id}`}
                  onPress={() => void toggleSocial('blocked', user.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: theme.destructive, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <ThemedText type="small" style={{ color: theme.destructive }}>
                    {chipLabel(user)} ✕
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          <SettingsRowSeparator />
          <View style={styles.socialRow}>
            <ThemedText type="smallBold">
              {t('settings.muted_users', 'Utilisateurs masqués')}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {social?.muted.length ?? 0}
            </ThemedText>
          </View>
          {social && social.muted.length > 0 ? (
            <View style={styles.chips}>
              {social.muted.map((user) => (
                <Pressable
                  key={`m-${user.id}`}
                  onPress={() => void toggleSocial('muted', user.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <ThemedText type="small" style={styles.chipText}>
                    {chipLabel(user)} ✕
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </SettingsSection>
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  mutedWrap: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  mutedInputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 11,
    fontSize: 14,
  },
  addBtn: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontWeight: '600',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
});
