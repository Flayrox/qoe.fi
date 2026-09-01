// =====================================================================
// ⚙️ settings-ui — Kit UI des écrans Réglages (parité web settings)
// =====================================================================
// Composants de base : coquille d'écran (header liquid + scroll),
// sections, rangées lien/toggle/select (ActionSheet), rangées destructives.
// =====================================================================

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomSubHeader } from '@/components/header/CustomSubHeader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionSheet, type ActionSheetGroup } from '@/components/ui/action-sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';

// ─── Coquille d'écran ────────────────────────────────────────────────

export function SettingsScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <ThemedView style={styles.container}>
      <CustomSubHeader title={title} subtitle={subtitle} />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: 115 }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// ─── Section ─────────────────────────────────────────────────────────

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {title.toUpperCase()}
        </ThemedText>
      ) : null}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

/** Sépare les rangées d'une même carte (1px, marge latérale façon iOS). */
export function SettingsRowSeparator() {
  const theme = useTheme();
  return <View style={[styles.rowSeparator, { backgroundColor: theme.border }]} />;
}

// ─── Rangée lien (chevron) ───────────────────────────────────────────

export function SettingsLinkRow({
  icon,
  label,
  description,
  onPress,
  right,
  destructive,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  description?: string;
  onPress: () => void;
  right?: ReactNode;
  destructive?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.backgroundElement }]}>
        <SymbolView
          name={icon}
          size={18}
          tintColor={destructive ? theme.destructive : theme.primary}
          weight="medium"
        />
      </View>
      <View style={styles.rowBody}>
        <ThemedText style={[styles.rowLabel, destructive && { color: theme.destructive }]}>
          {label}
        </ThemedText>
        {description ? (
          <ThemedText type="small" style={[styles.rowDescription, { color: theme.textSecondary }]}>
            {description}
          </ThemedText>
        ) : null}
      </View>
      {right ? (
        right
      ) : (
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={15}
          tintColor={theme.textSecondary}
          weight="semibold"
        />
      )}
    </Pressable>
  );
}

// ─── Rangée toggle ───────────────────────────────────────────────────

export function SettingsToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, styles.rowToggle]}>
      <View style={styles.rowBody}>
        <ThemedText style={styles.rowLabel}>{label}</ThemedText>
        {description ? (
          <ThemedText type="small" style={[styles.rowDescription, { color: theme.textSecondary }]}>
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor="#ffffff"
        ios_backgroundColor={theme.border}
      />
    </View>
  );
}

// ─── Rangée select (ActionSheet) ─────────────────────────────────────

export interface SettingsSelectOption {
  value: string;
  label: string;
}

export function SettingsSelectRow({
  label,
  description,
  value,
  options,
  onChange,
  onOpen,
}: {
  label: string;
  description?: string;
  value: string;
  options: SettingsSelectOption[];
  onChange: (value: string) => void;
  /** Surcharge pour intercepter l'ouverture (ex. quitter provisoirement l'écran). */
  onOpen?: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const openSheet = () => {
    playHaptic('Light');
    if (onOpen) {
      onOpen();
      return;
    }
    setOpen(true);
  };

  const group: ActionSheetGroup = {
    items: options.map((option) => ({
      key: option.value,
      label: option.label,
      icon: {
        ios: option.value === value ? 'checkmark.circle.fill' : 'circle',
        android: option.value === value ? 'check_circle' : 'radio_button_unchecked',
        web: option.value === value ? 'check_circle' : 'radio_button_unchecked',
      },
      onPress: () => {
        setOpen(false);
        if (option.value !== value) onChange(option.value);
      },
    })),
  };

  return (
    <>
      <Pressable
        onPress={openSheet}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
        ]}
      >
        <View style={styles.rowBody}>
          <ThemedText style={styles.rowLabel}>{label}</ThemedText>
          {description ? (
            <ThemedText
              type="small"
              style={[styles.rowDescription, { color: theme.textSecondary }]}
            >
              {description}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.selectValueWrap}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {selected?.label ?? value}
          </ThemedText>
          <SymbolView
            name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more', web: 'unfold_more' }}
            size={13}
            tintColor={theme.textSecondary}
            weight="medium"
          />
        </View>
      </Pressable>
      <ActionSheet visible={open} title={label} onClose={() => setOpen(false)} groups={[group]} />
    </>
  );
}

// ─── Rangée destructive / action seule ───────────────────────────────

export function SettingsActionRow({
  label,
  onPress,
  destructive,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
          opacity: disabled || busy ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.rowBody}>
        <ThemedText
          style={[
            styles.rowLabel,
            { color: destructive ? theme.destructive : theme.primary, textAlign: 'center' },
          ]}
        >
          {busy ? t('settings.saving', 'Enregistrement…') : label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

// ─── Note d'information sous une section ─────────────────────────────

export function SettingsFootnote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedText type="small" style={[styles.footnote, { color: theme.textSecondary }]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    marginLeft: Spacing.two,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  card: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 13,
    minHeight: 52,
  },
  rowToggle: {
    alignItems: 'center',
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowDescription: {
    lineHeight: 16,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + 34 + Spacing.three, // aligné après l'icône
  },
  selectValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 180,
  },
  footnote: {
    marginHorizontal: Spacing.two,
    lineHeight: 16,
  },
});
