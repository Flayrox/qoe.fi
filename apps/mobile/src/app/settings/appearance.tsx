// =====================================================================
// 🎨 Route /settings/appearance — Apparence & lecture
// =====================================================================
// Parité web : thème (local, persisté), taille du texte + aperçu,
// lecture automatique, animations réduites, contraste renforcé,
// feed par défaut (préférences serveur /v1/settings/preferences).
// =====================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { useThemePreference, type ThemePreference } from '@/context/theme-provider';
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

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: t('settings.theme_system', 'Système') },
  { value: 'light', label: t('settings.theme_light', 'Clair') },
  { value: 'dark', label: t('settings.theme_dark', 'Sombre') },
];

const fontScaleOptions = [
  { value: '90', label: t('settings.font_small', 'Petite') },
  { value: '100', label: t('settings.font_standard', 'Standard') },
  { value: '110', label: t('settings.font_large', 'Grande') },
  { value: '125', label: t('settings.font_xlarge', 'Très grande') },
];

export default function AppearanceSettingsRoute() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { preference, setPreference } = useThemePreference();

  const { data: settings } = useQuery({
    queryKey: ['settings', 'user-settings'],
    queryFn: async () => {
      const res = await apiClient.getUserSettings();
      if (!res.ok) throw new Error(res.error);
      return res.data;
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

  const changeTheme = (value: ThemePreference) => {
    playHaptic('Light');
    setPreference(value);
  };

  return (
    <SettingsScreenShell
      title={t('settings.appearance', 'Apparence & lecture')}
      subtitle={t('settings.appearance_subtitle', 'Une expérience calme et lisible')}
    >
      <SettingsSection title={t('settings.appearance_theme', 'Thème')}>
        <View>
          <SettingsSelectRow
            label={t('settings.theme', 'Thème')}
            description={t('settings.theme_desc', 'Clair, sombre ou selon le système')}
            value={preference}
            options={themeOptions}
            onChange={(value) => changeTheme(value as ThemePreference)}
          />
          <SettingsRowSeparator />
          <SettingsSelectRow
            label={t('settings.font_scale', 'Taille du texte')}
            description={t('settings.font_scale_desc', 'Ajuste la taille de lecture')}
            value={String(settings?.fontScale ?? 100)}
            options={fontScaleOptions}
            onChange={(value) => void patch({ fontScale: Number(value) })}
          />
        </View>
        {settings ? (
          <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={[styles.previewLabel, { color: theme.textSecondary }]}>
              {t('settings.reading_preview', 'Aperçu de la lecture')}
            </ThemedText>
            <View style={{ gap: 6 }}>
              <ThemedText
                style={[styles.previewTitle, { fontSize: 16 * (settings.fontScale / 100) }]}
              >
                {t('settings.preview_title', 'Le temps long de la lecture attentive.')}
              </ThemedText>
              <ThemedText
                type="small"
                style={{
                  color: theme.textSecondary,
                  fontSize: 13 * (settings.fontScale / 100),
                  lineHeight: 18 * (settings.fontScale / 100),
                }}
              >
                {t(
                  'settings.preview_body',
                  'Une taille de texte confortable réduit la fatigue et prolonge l’attention portée à chaque idée.'
                )}
              </ThemedText>
              {settings.highContrast ? (
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {t('settings.high_contrast_on', 'Contraste renforcé activé.')}
                </ThemedText>
              ) : null}
            </View>
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('settings.appearance_reading', 'Lecture')}>
        <View>
          <SettingsSelectRow
            label={t('settings.default_feed', 'Feed par défaut')}
            description={t(
              'settings.default_feed_desc',
              'La vue ouverte à l’arrivée sur l’accueil'
            )}
            value={settings?.defaultFeed ?? 'FOLLOWING'}
            options={[
              { value: 'FOLLOWING', label: t('settings.default_feed_following', 'Abonnements') },
              { value: 'DISCOVER', label: t('settings.default_feed_discover', 'Découvrir') },
            ]}
            onChange={(value) => void patch({ defaultFeed: value })}
          />
          <SettingsRowSeparator />
          <SettingsToggleRow
            label={t('settings.autoplay', 'Lecture automatique des médias')}
            description={t(
              'settings.autoplay_desc',
              'Lance automatiquement les vidéos et contenus animés'
            )}
            value={settings?.autoplayMedia ?? true}
            onChange={(value) => void patch({ autoplayMedia: value })}
          />
          <SettingsRowSeparator />
          <SettingsToggleRow
            label={t('settings.reduce_motion', 'Réduire les animations')}
            description={t(
              'settings.reduce_motion_desc',
              'Respecte votre préférence pour une interface stable'
            )}
            value={settings?.reduceMotion ?? false}
            onChange={(value) => void patch({ reduceMotion: value })}
          />
          <SettingsRowSeparator />
          <SettingsToggleRow
            label={t('settings.high_contrast', 'Contraste renforcé')}
            description={t(
              'settings.high_contrast_desc',
              'Améliore la lisibilité des éléments d’interface'
            )}
            value={settings?.highContrast ?? false}
            onChange={(value) => void patch({ highContrast: value })}
          />
        </View>
        <SettingsFootnote>
          {t(
            'settings.appearance_footnote',
            'Le thème est propre à cet appareil ; les autres réglages sont synchronisés sur tous vos appareils.'
          )}
        </SettingsFootnote>
      </SettingsSection>
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  preview: {
    margin: 16,
    marginTop: 0,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  previewTitle: {
    fontWeight: '700',
  },
});
