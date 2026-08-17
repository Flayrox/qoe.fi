// =====================================================================
// ⋯ ProfileMenu — Menu d'actions d'un profil (port de
//    .reference/bluesky/src/view/com/profile/ProfileMenu.tsx)
// =====================================================================
// Copier le lien, partager, ouvrir le profil, masquer/bloquer (stub).
// =====================================================================

import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { ActionSheet } from '@/components/ui/action-sheet';
import { Toast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/use-theme';
import { copyText } from '@/lib/clipboard';
import { t } from '@/lib/i18n';

export function ProfileMenuButton({ username, isOwn }: { username: string; isOwn?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const url = `https://qoe.fi/@${username}`;

  const onCopy = async () => {
    setOpen(false);
    await copyText(url);
    Toast.show(t('profile.link_copied', 'Lien du profil copié'), 'success');
  };

  const onOpen = () => {
    setOpen(false);
    void WebBrowser.openBrowserAsync(url);
  };

  const onStub = (label: string) => {
    setOpen(false);
    Toast.show(t('profile.coming_soon', `${label} — bientôt disponible`));
  };

  const items = isOwn
    ? [
        {
          key: 'copy',
          label: t('profile.copy_link', 'Copier le lien'),
          icon: { ios: 'link', android: 'link', web: 'link' } as const,
          onPress: () => void onCopy(),
        },
        {
          key: 'open',
          label: t('profile.open', 'Ouvrir le profil'),
          icon: { ios: 'safari', android: 'public', web: 'public' } as const,
          onPress: onOpen,
        },
      ]
    : [
        {
          key: 'copy',
          label: t('profile.copy_link', 'Copier le lien'),
          icon: { ios: 'link', android: 'link', web: 'link' } as const,
          onPress: () => void onCopy(),
        },
        {
          key: 'open',
          label: t('profile.open', 'Ouvrir le profil'),
          icon: { ios: 'safari', android: 'public', web: 'public' } as const,
          onPress: onOpen,
        },
        {
          key: 'mute',
          label: t('profile.mute', 'Masquer ce compte'),
          icon: { ios: 'speaker.slash', android: 'volume_off', web: 'volume_off' } as const,
          onPress: () => onStub('Masquer'),
        },
        {
          key: 'block',
          label: t('profile.block', 'Bloquer ce compte'),
          icon: { ios: 'person.crop.circle.badge.xmark', android: 'block', web: 'block' } as const,
          destructive: true,
          onPress: () => onStub('Bloquer'),
        },
        {
          key: 'report',
          label: t('profile.report', 'Signaler ce compte'),
          icon: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' } as const,
          destructive: true,
          onPress: () => onStub('Signaler'),
        },
      ];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={styles.btn}
        accessibilityLabel={t('profile.more', 'Plus d’options')}
      >
        <SymbolView
          name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          size={20}
          tintColor={theme.textSecondary}
          weight="regular"
        />
      </Pressable>
      <ActionSheet visible={open} groups={[{ items }]} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 4,
  },
});
