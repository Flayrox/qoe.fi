// =====================================================================
// ⋯ PostMenu — Menu d'actions d'une pensée (port de
//    .reference/bluesky/src/components/PostControls/PostMenu/PostMenuItems.tsx)
// =====================================================================
// Regroupe : copier le texte, traduire (Google Translate), masquer pour
// moi, muet/block (stub), signaler, et si c'est la mienne : épingler,
// supprimer. Rendu en ActionSheet bottom-sheet.
// =====================================================================

import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet, type ActionSheetGroup } from '@/components/ui/action-sheet';
import { Toast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';
import type { NormalizedThought } from './normalize';

const ICON = {
  pin: { ios: 'pin', android: 'push_pin', web: 'push_pin' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
  translate: { ios: 'character.bubble', android: 'translate', web: 'translate' },
  eyeSlash: { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' },
  mute: { ios: 'speaker.slash', android: 'volume_off', web: 'volume_off' },
  personX: { ios: 'person.crop.circle.badge.xmark', android: 'block', web: 'block' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  smile: { ios: 'face.smiling', android: 'sentiment_satisfied', web: 'sentiment_satisfied' },
  sad: { ios: 'face.dashed', android: 'sentiment_dissatisfied', web: 'sentiment_dissatisfied' },
} as const;

export function PostMenuButton({
  post,
  customButton,
}: {
  post: NormalizedThought;
  customButton?: (props: { onPress: () => void }) => React.ReactNode;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const isOwn = me?.id === post.author.id;
  const postUrl = `https://qoe.fi/thought/${post.author.username || post.author.id}/${post.id}`;

  const onCopyText = async () => {
    setOpen(false);
    await copyText(post.content);
    Toast.show(t('post.copied_text', 'Texte copié'), 'success');
  };

  const onCopyLink = async () => {
    setOpen(false);
    await copyText(postUrl);
    Toast.show(t('post.copied_link', 'Lien copié'), 'success');
  };

  const onTranslate = () => {
    setOpen(false);
    void WebBrowser.openBrowserAsync(
      `https://translate.google.com/?sl=auto&tl=fr&text=${encodeURIComponent(post.content.slice(0, 900))}`
    );
  };

  const onDelete = async () => {
    setOpen(false);
    if (busy) return;
    setBusy(true);
    const res = await apiClient.deleteThought(post.id);
    setBusy(false);
    if (res.ok) {
      Toast.show(t('post.deleted', 'Pensée supprimée'), 'success');
      await queryClient.invalidateQueries({ queryKey: feedKeys.all });
      if (router.canGoBack()) router.back();
    } else {
      Toast.show(res.error, 'error');
    }
  };

  const onTogglePin = async () => {
    setOpen(false);
    const res = await apiClient.togglePin(post.id);
    if (res.ok) {
      Toast.show(
        res.data.pinned ? t('post.pinned', 'Épinglé au profil') : t('post.unpinned', 'Désépinglé'),
        'success'
      );
      await queryClient.invalidateQueries({ queryKey: feedKeys.all });
    } else {
      Toast.show(res.error, 'error');
    }
  };

  const onStub = (label: string) => {
    setOpen(false);
    Toast.show(t('post.coming_soon', `${label} — bientôt disponible`));
  };

  const onMute = async () => {
    setOpen(false);
    if (busy) return;
    setBusy(true);
    const res = await apiClient.toggleMuteUser(post.author.id);
    setBusy(false);
    if (res.ok) {
      Toast.show(
        res.data.muted
          ? t('post.muted', `@${post.author.username || '…'} masqué`)
          : t('post.unmuted', `@${post.author.username || '…'} démasqué`),
        'success'
      );
    } else {
      Toast.show(res.error, 'error');
    }
  };

  const onBlock = async () => {
    setOpen(false);
    if (busy) return;
    setBusy(true);
    const res = await apiClient.toggleBlockUser(post.author.id);
    setBusy(false);
    if (res.ok) {
      Toast.show(
        res.data.blocked
          ? t('post.blocked', `@${post.author.username || '…'} bloqué`)
          : t('post.unblocked', `@${post.author.username || '…'} débloqué`),
        'success'
      );
      await queryClient.invalidateQueries({ queryKey: feedKeys.all });
    } else {
      Toast.show(res.error, 'error');
    }
  };

  const onReport = async () => {
    setOpen(false);
    if (busy) return;
    setBusy(true);
    const res = await apiClient.createReport({
      targetId: post.id,
      targetType: 'thought',
      reason: 'other',
    });
    setBusy(false);
    if (res.ok) {
      Toast.show(t('post.reported', 'Signalement envoyé. Merci !'), 'success');
    } else {
      Toast.show(res.error, 'error');
    }
  };

  const groups: ActionSheetGroup[] = [];

  // 1. Actions auteur
  if (isOwn) {
    groups.push({
      items: [
        {
          key: 'pin',
          label: post.isPinned
            ? t('post.unpin', 'Désépingler du profil')
            : t('post.pin', 'Épingler au profil'),
          icon: ICON.pin,
          onPress: () => void onTogglePin(),
          disabled: busy,
        },
        {
          key: 'delete',
          label: t('post.delete', 'Supprimer la pensée'),
          icon: ICON.trash,
          destructive: true,
          onPress: () => void onDelete(),
          disabled: busy,
        },
      ],
    });
  }

  // 2. Actions générales (Traduire, Copier le texte, Copier le lien)
  groups.push({
    items: [
      {
        key: 'translate',
        label: t('post.translate', 'Traduire'),
        icon: ICON.translate,
        onPress: onTranslate,
      },
      {
        key: 'copy_text',
        label: t('post.copy_text', 'Copier le texte de la pensée'),
        icon: ICON.copy,
        onPress: () => void onCopyText(),
      },
      {
        key: 'copy_link',
        label: t('post.copy_link', 'Copier le lien vers la pensée'),
        icon: { ios: 'link', android: 'link', web: 'link' },
        onPress: () => void onCopyLink(),
      },
    ],
  });

  // 3. Actions de modération & masquage
  if (!isOwn) {
    groups.push({
      items: [
        {
          key: 'hide',
          label: t('post.hide', 'Masquer cette pensée pour moi'),
          icon: ICON.eyeSlash,
          onPress: () => onStub('Masquer'),
        },
        {
          key: 'muteThread',
          label: t('post.mute_thread', 'Mettre le fil en sourdine'),
          icon: ICON.mute,
          onPress: () => onStub('Mettre en sourdine'),
        },
        {
          key: 'mute',
          label: t('post.mute_account', `Masquer @${post.author.username || '…'}`),
          icon: ICON.mute,
          onPress: () => void onMute(),
          disabled: busy,
        },
        {
          key: 'block',
          label: t('post.block', `Bloquer @${post.author.username || '…'}`),
          icon: ICON.personX,
          destructive: true,
          onPress: () => void onBlock(),
          disabled: busy,
        },
        {
          key: 'report',
          label: t('post.report', 'Signaler la pensée'),
          icon: ICON.warning,
          destructive: true,
          onPress: () => void onReport(),
          disabled: busy,
        },
      ],
    });
  }

  // 4. Feedback feed Bluesky
  groups.push({
    items: [
      {
        key: 'more',
        label: t('post.show_more', 'Voir plus de contenu comme ça'),
        icon: ICON.smile,
        onPress: () => onStub('Feedback envoyé'),
      },
      {
        key: 'less',
        label: t('post.show_less', 'Voir moins de contenu comme ça'),
        icon: ICON.sad,
        onPress: () => onStub('Feedback envoyé'),
      },
    ],
  });

  return (
    <>
      {customButton ? (
        customButton({ onPress: () => setOpen(true) })
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          hitSlop={8}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          accessibilityLabel={t('post.more', 'Plus d’options')}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
        </Pressable>
      )}
      <ActionSheet visible={open} groups={groups} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 4,
  },
  pressed: {
    opacity: 0.5,
  },
});
