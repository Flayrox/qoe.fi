// =====================================================================
// 📦 updates-controls — vérification d'updates OTA (expo-updates)
// =====================================================================
// Deux exports :
//   1. <UpdateBackgroundCheck />  — monté dans AppProviders : applique
//      automatiquement un update déjà téléchargé (isUpdatePending → reload)
//      et re-vérifie une fois peu après le démarrage (au cas où l'app est
//      restée ouverte quand un update a été publié).
//   2. <UpdateCheckRow />         — rangée « Vérifier les mises à jour »
//      dans les Réglages : check → download → reload, avec état visible.
//
// ⚠️ L'API Updates n'est disponible qu'en build RELEASE : en debug/Expo Go,
//    checkForUpdateAsync rejette → message explicite. Sur web, non supporté.
// =====================================================================

import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SettingsActionRow, SettingsFootnote } from '@/features/settings/settings-ui';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { playHaptic } from '@/lib/haptics';

/** Vérification/application en arrière-plan (monté dans AppProviders). */
export function UpdateBackgroundCheck() {
  const { isUpdatePending } = Updates.useUpdates();

  // Update déjà téléchargé (check ON_LOAD) → on l'applique tout de suite.
  useEffect(() => {
    if (isUpdatePending) {
      Updates.reloadAsync().catch(() => {
        // échec du reload → l'update s'appliquera au prochain lancement
      });
    }
  }, [isUpdatePending]);

  // Re-vérifie une fois après le démarrage : couvre le cas où un update a
  // été publié pendant que l'app était ouverte (check ON_LOAD déjà passé).
  useEffect(() => {
    const timer = setTimeout(() => {
      Updates.checkForUpdateAsync()
        .then((result) => {
          if (result.isAvailable) {
            return Updates.fetchUpdateAsync();
          }
        })
        .catch(() => {
          // dev build / web : API indisponible → silencieux
        });
    }, 10_000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

type CheckState = 'idle' | 'checking' | 'downloading';

/** Rangée « Vérifier les mises à jour » (écran Réglages). */
export function UpdateCheckRow() {
  const theme = useTheme();
  const [state, setState] = useState<CheckState>('idle');
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(
    null
  );

  const runCheck = async () => {
    if (Platform.OS === 'web') {
      setMessage({
        kind: 'info',
        text: t('settings.update_web_only', 'Les mises à jour OTA ne s’appliquent pas sur le web.'),
      });
      return;
    }
    setState('checking');
    setMessage(null);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        playHaptic('Light');
        setState('idle');
        setMessage({ kind: 'ok', text: t('settings.update_up_to_date', 'Application à jour.') });
        return;
      }
      setState('downloading');
      await Updates.fetchUpdateAsync();
      playHaptic('Success');
      // Le reload applique l'update : l'app redémarre proprement.
      await Updates.reloadAsync();
    } catch {
      setState('idle');
      setMessage({
        kind: 'err',
        text: t(
          'settings.update_dev_only',
          'Indisponible en développement (build release requis) ou erreur réseau.'
        ),
      });
    }
  };

  const { currentlyRunning } = Updates.useUpdates();
  const version = Constants.expoConfig?.version;
  const isEmbedded = currentlyRunning?.isEmbeddedLaunch ?? true;
  const runtimeVersion = currentlyRunning?.runtimeVersion ?? null;

  return (
    <View>
      <SettingsActionRow
        label={
          state === 'checking'
            ? t('settings.update_checking', 'Vérification…')
            : state === 'downloading'
              ? t('settings.update_downloading', 'Téléchargement…')
              : t('settings.update_check', 'Vérifier les mises à jour')
        }
        busy={state !== 'idle'}
        onPress={() => void runCheck()}
      />
      {message ? (
        <ThemedText
          type="small"
          style={[
            styles.message,
            {
              color:
                message.kind === 'ok'
                  ? theme.success
                  : message.kind === 'err'
                    ? theme.destructive
                    : theme.textSecondary,
            },
          ]}
        >
          {message.text}
        </ThemedText>
      ) : null}
      <SettingsFootnote>
        {[
          version ? t('settings.version', 'Version {version}', { version }) : null,
          runtimeVersion
            ? t('settings.update_runtime', 'Runtime {version}', { version: runtimeVersion })
            : null,
          !Platform.OS || Platform.OS === 'web'
            ? null
            : isEmbedded
              ? t('settings.update_embedded', 'bundle embarqué')
              : t('settings.update_remote', 'update OTA'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </SettingsFootnote>
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
    lineHeight: 17,
  },
});
