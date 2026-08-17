// =====================================================================
// ↗️ ShareMenu — Feuille de partage d'une pensée (port de
//    .reference/bluesky/src/components/PostControls/ShareMenu)
// =====================================================================
// Copier le lien, partager (feuille système), ouvrir dans le navigateur.
// =====================================================================

import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Share } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { ActionSheet } from '@/components/ui/action-sheet';
import { Toast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/use-theme';
import { copyText } from '@/lib/clipboard';
import { t } from '@/lib/i18n';

const ICON = {
  copy: { ios: 'link', android: 'link', web: 'link' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  browser: { ios: 'safari', android: 'public', web: 'public' },
} as const;

export function ShareMenuButton({ url }: { url: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const onCopy = async () => {
    setOpen(false);
    await copyText(url);
    Toast.show(t('share.copied', 'Lien copié'), 'success');
  };

  const onShare = () => {
    setOpen(false);
    void Share.share({ message: url, url }).catch(() => {});
  };

  const onOpen = () => {
    setOpen(false);
    void WebBrowser.openBrowserAsync(url);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel={t('share.share', 'Partager')}
      >
        <SymbolView
          name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
          size={18}
          tintColor={theme.textSecondary}
          weight="regular"
        />
      </Pressable>
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        groups={[
          {
            items: [
              {
                key: 'copy',
                label: t('share.copy_link', 'Copier le lien'),
                icon: ICON.copy,
                onPress: () => void onCopy(),
              },
              {
                key: 'share',
                label: t('share.share', 'Partager…'),
                icon: ICON.share,
                onPress: onShare,
              },
              {
                key: 'open',
                label: t('share.open', 'Ouvrir dans le navigateur'),
                icon: ICON.browser,
                onPress: onOpen,
              },
            ],
          },
        ]}
      />
    </>
  );
}
