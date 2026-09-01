// =====================================================================
// 🌍 Route /settings/language — Langue de l'application (persistée)
// =====================================================================
// Choix local (AsyncStorage via LanguagePreferenceProvider) appliqué
// immédiatement au singleton Lingui — les autres écrans re-traduisent
// au prochain rendu.
// =====================================================================

import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useAppLanguage, type AppLanguage } from '@/context/language-provider';
import {
  SettingsRowSeparator,
  SettingsScreenShell,
  SettingsSection,
} from '@/features/settings/settings-ui';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';

const languages: { value: AppLanguage; label: string; native: string }[] = [
  { value: 'fr', label: t('settings.lang_fr', 'Français'), native: 'Français' },
  { value: 'en', label: t('settings.lang_en', 'Anglais'), native: 'English' },
];

export default function LanguageSettingsRoute() {
  const theme = useTheme();
  const { language, setLanguage } = useAppLanguage();

  return (
    <SettingsScreenShell
      title={t('settings.language', 'Langue')}
      subtitle={t('settings.language_subtitle', 'Langue de l’application')}
    >
      <SettingsSection title={t('settings.language_choice', 'Langue')}>
        <View>
          {languages.map((lang, index) => {
            const selected = language === lang.value;
            return (
              <View key={lang.value}>
                {index > 0 ? <SettingsRowSeparator /> : null}
                <Pressable
                  onPress={() => {
                    if (selected) return;
                    playHaptic('Light');
                    setLanguage(lang.value);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                  ]}
                >
                  <View style={styles.rowBody}>
                    <ThemedText style={styles.rowLabel}>{lang.native}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {lang.label}
                    </ThemedText>
                  </View>
                  {selected ? (
                    <SymbolView
                      name={{
                        ios: 'checkmark.circle.fill',
                        android: 'check_circle',
                        web: 'check_circle',
                      }}
                      size={22}
                      tintColor={theme.primary}
                      weight="medium"
                    />
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </SettingsSection>
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
