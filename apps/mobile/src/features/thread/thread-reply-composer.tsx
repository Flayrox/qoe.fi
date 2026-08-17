// =====================================================================
// ✍️ ThreadReplyComposer — Barre de réponse en bas d'un fil (port de
//    .reference/bluesky/src/screens/PostThread/components/ThreadComposePrompt.tsx)
// =====================================================================
// Bluesky ne met pas un champ texte brut dans le fil : il affiche une
// barre « avatar + Écrire votre réponse » qui ouvre le composer complet.
// Ici le tap route vers /compose avec le contexte de réponse (parentId +
// handle de l'auteur), donc on garde le composer plein écran + brouillons.
// =====================================================================

import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/thought/avatar';
import { Spacing } from '@/constants/theme';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';

export function ThreadReplyComposer({
  postId,
  replyingTo,
  parentContent,
}: {
  /** Pensée à laquelle on répond (la cible du fil). */
  postId: string;
  /** Handle de l'auteur de la pensée ciblée. */
  replyingTo?: string | null;
  /** Extrait du contenu de la pensée ciblée (aperçu dans le composer). */
  parentContent?: string | null;
}) {
  const theme = useTheme();
  const { data: me } = useMe();

  const onPress = () => {
    playHaptic('Light');
    router.push({
      pathname: '/compose',
      params: {
        parentId: postId,
        replyingTo: replyingTo ?? '',
        parentContent: (parentContent ?? '').slice(0, 140),
      },
    });
  };

  return (
    <View style={[styles.wrap, { borderTopColor: theme.border }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('thread.reply', 'Répondre')}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        ]}
      >
        <Avatar
          user={{ name: me?.name, username: me?.username, logoUrl: me?.logoUrl }}
          sizeNumber={24}
        />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {t('thread.write_reply', 'Écrire votre réponse')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
