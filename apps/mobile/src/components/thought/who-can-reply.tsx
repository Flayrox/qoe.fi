// =====================================================================
// 🗣️ WhoCanReply — Restriction de réponse (port de
//    .reference/bluesky/src/components/WhoCanReply.tsx)
// =====================================================================
// Badge « Seuls les comptes mentionnés peuvent répondre » / « Tout le
// monde peut répondre » + picker pour le composer (threadgate).
// =====================================================================

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { ActionSheet, type ActionSheetItem } from '@/components/ui/action-sheet';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export type ReplyRestriction = 'everyone' | 'followed' | 'mentioned' | 'nobody';

const LABELS: Record<ReplyRestriction, string> = {
  everyone: t('reply.everyone', 'Tout le monde peut répondre'),
  followed: t('reply.followed', 'Les comptes que je suis peuvent répondre'),
  mentioned: t('reply.mentioned', 'Seuls les comptes mentionnés peuvent répondre'),
  nobody: t('reply.nobody', 'Personne ne peut répondre'),
};

/** Badge « restriction de réponse » affiché sous un post. */
export function WhoCanReplyBadge({ restriction }: { restriction: string }) {
  const theme = useTheme();
  if (!restriction || restriction === 'everyone') return null;
  return (
    <View style={styles.badgeRow}>
      <SymbolView
        name={{
          ios: 'bubble.left.and.exclamationmark.bubble.right',
          android: 'forum',
          web: 'forum',
        }}
        size={12}
        tintColor={theme.textSecondary}
        weight="regular"
      />
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {LABELS[restriction as ReplyRestriction] ?? LABELS.everyone}
      </ThemedText>
    </View>
  );
}

/** Picker de restriction pour le composer. */
export function WhoCanReplyPicker({
  value,
  onChange,
}: {
  value: ReplyRestriction;
  onChange: (v: ReplyRestriction) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const icons: Record<ReplyRestriction, SymbolViewProps['name']> = {
    everyone: { ios: 'globe', android: 'public', web: 'public' },
    followed: { ios: 'person.2', android: 'group', web: 'group' },
    mentioned: { ios: 'at', android: 'alternate_email', web: 'alternate_email' },
    nobody: { ios: 'nosign', android: 'block', web: 'block' },
  };

  const items: ActionSheetItem[] = (Object.keys(LABELS) as ReplyRestriction[]).map((key) => ({
    key,
    label: LABELS[key],
    icon: icons[key],
    onPress: () => {
      onChange(key);
      setOpen(false);
    },
  }));

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.pickerBtn} hitSlop={8}>
        <SymbolView
          name={
            value === 'everyone'
              ? { ios: 'globe', android: 'public', web: 'public' }
              : { ios: 'person.2', android: 'group', web: 'group' }
          }
          size={16}
          tintColor={theme.primary}
          weight="regular"
        />
        <ThemedText type="small" style={{ color: theme.primary }}>
          {LABELS[value]}
        </ThemedText>
      </Pressable>
      <ActionSheet
        visible={open}
        title={t('reply.who', 'Qui peut répondre ?')}
        groups={[{ items }]}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
});
