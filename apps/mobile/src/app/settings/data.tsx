// =====================================================================
// 📦 Route /settings/data — Données & suppression
// =====================================================================
// Parité web : export GDPR (GET /v1/me/data-export → fichier partagé),
// demande d'annulation de la suppression de compte, suppression (DELETE
// de confirmation obligatoire).
// =====================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
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

export default function DataSettingsRoute() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const { data: deletionRequest } = useQuery({
    queryKey: ['settings', 'deletion-request'],
    queryFn: async () => {
      const res = await apiClient.getDeletionRequest();
      if (!res.ok) throw new Error(res.error);
      return res.data ?? null;
    },
    staleTime: 30_000,
  });

  const exportData = async () => {
    setBusy(true);
    try {
      const res = await apiClient.exportAccountData();
      if (!res.ok) throw new Error(res.error);
      const json = JSON.stringify(res.data, null, 2);
      const file = new File('qoe-fi-export.json');
      file.write(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: t('settings.data_export_title', 'Export de mes données Qoe'),
        });
      } else {
        Toast.show(
          t('settings.data_export_unsupported', 'Partage non disponible sur cet appareil'),
          'error'
        );
      }
      playHaptic('Success');
    } catch (err) {
      playHaptic('Heavy');
      Toast.show(
        err instanceof Error ? err.message : t('settings.data_export_error', 'Export impossible'),
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const requestDeletion = async () => {
    if (confirmation !== 'DELETE') {
      Toast.show(
        t('settings.delete_confirm_hint', 'Écrivez DELETE pour confirmer la demande.'),
        'error'
      );
      return;
    }
    setBusy(true);
    const res = await apiClient.requestAccountDeletion();
    setBusy(false);
    if (!res.ok) {
      Toast.show(res.error, 'error');
      return;
    }
    playHaptic('Success');
    setConfirmation('');
    await queryClient.invalidateQueries({ queryKey: ['settings', 'deletion-request'] });
    Toast.show(t('settings.delete_requested', 'Demande de suppression enregistrée.'), 'success');
  };

  const cancelDeletion = async () => {
    setBusy(true);
    const res = await apiClient.cancelAccountDeletion();
    setBusy(false);
    if (!res.ok) {
      Toast.show(res.error, 'error');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['settings', 'deletion-request'] });
    Toast.show(t('settings.delete_canceled', 'Demande de suppression annulée.'), 'success');
  };

  const pending = deletionRequest?.status === 'PENDING' || deletionRequest?.status === 'PROCESSING';

  return (
    <SettingsScreenShell
      title={t('settings.data', 'Données & suppression')}
      subtitle={t('settings.data_subtitle', 'Exportez ou supprimez votre compte')}
    >
      <SettingsSection>
        <View>
          <SettingsLinkRow
            icon={{ ios: 'arrow.down.doc', android: 'download', web: 'download' }}
            label={t('settings.data_export', 'Exporter mes données')}
            description={t(
              'settings.data_export_desc',
              'Pensées, articles, signets, surlignages et préférences'
            )}
            onPress={() => void exportData()}
          />
          <SettingsRowSeparator />
          <SettingsLinkRow
            icon={{ ios: 'hand.raised', android: 'shield', web: 'shield' }}
            label={t('settings.muted_shortcut', 'Mots masqués')}
            description={t(
              'settings.muted_shortcut_desc',
              'Gérez les mots filtrés de votre fil d’actualité'
            )}
            onPress={() => router.push('/settings/privacy')}
          />
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.delete_title', 'Supprimer le compte')}>
        {pending ? (
          <View style={styles.pendingWrap}>
            <ThemedText style={styles.pendingTitle}>
              {t('settings.delete_pending', 'Suppression en attente')}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {t('settings.delete_pending_desc', 'Demandée le {date}.', {
                date: deletionRequest?.requestedAt
                  ? new Date(deletionRequest.requestedAt).toLocaleDateString()
                  : '—',
              })}
            </ThemedText>
            <Pressable
              onPress={() => void cancelDeletion()}
              disabled={busy}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  borderColor: theme.border,
                  backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                },
              ]}
            >
              <ThemedText type="smallBold">
                {t('settings.delete_cancel', 'Annuler la demande')}
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.deleteWrap}>
            <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 17 }}>
              {t(
                'settings.delete_desc',
                'Votre demande sera traitée par l’équipe. Cette action est irréversible après validation.'
              )}
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder={t('settings.delete_placeholder', 'Écrivez DELETE')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <SettingsActionRow
              label={t('settings.delete_request', 'Demander la suppression')}
              destructive
              busy={busy}
              onPress={() => void requestDeletion()}
            />
          </View>
        )}
        <SettingsFootnote>
          {t(
            'settings.delete_footnote',
            'La suppression du compte est distincte de la simple déconnexion.'
          )}
        </SettingsFootnote>
      </SettingsSection>
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  pendingWrap: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  deleteWrap: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 11,
    fontSize: 14,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
  },
});
