// =====================================================================
// 🔔 Route /settings/notifications — Préférences de notifications
// =====================================================================
// Parité NotificationSettingsForm web, limité au contrat Go
// (les toggles email + push par type d'événement).
// =====================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { notificationKeys } from '@qoe/sdk/mobile';
import { Toast } from '@/components/ui/toast';
import type { NotificationPreferenceFlags } from '@qoe/sdk/mobile';

import {
  SettingsRowSeparator,
  SettingsScreenShell,
  SettingsSection,
  SettingsToggleRow,
} from '@/features/settings/settings-ui';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';

interface SectionDef {
  title: string;
  emailKey: keyof NotificationPreferenceFlags;
  pushKey: keyof NotificationPreferenceFlags;
  description: string;
}

// ⚠️ Attention : splice basé sur le contrat Go (Preferences struct) —
//    PAS de clés collaborations : le Go ne les persiste pas encore.
const sections: SectionDef[] = [
  {
    title: t('settings.notif_likes', 'J’aime & Réactions'),
    emailKey: 'emailLikes',
    pushKey: 'pushLikes',
    description: t('settings.notif_likes_desc', 'Quand quelqu’un aime l’une de vos pensées.'),
  },
  {
    title: t('settings.notif_replies', 'Réponses & Thread'),
    emailKey: 'emailReplies',
    pushKey: 'pushReplies',
    description: t(
      'settings.notif_replies_desc',
      'Quand un membre répond directement à votre pensée.'
    ),
  },
  {
    title: t('settings.notif_mentions', 'Mentions'),
    emailKey: 'emailMentions',
    pushKey: 'pushMentions',
    description: t('settings.notif_mentions_desc', 'Quand votre @username est cité.'),
  },
  {
    title: t('settings.notif_follows', 'Abonnements'),
    emailKey: 'emailFollows',
    pushKey: 'pushFollows',
    description: t(
      'settings.notif_follows_desc',
      'Quand un nouveau lecteur s’abonne à votre profil.'
    ),
  },
  {
    title: t('settings.notif_reposts', 'Repartages / Reposts'),
    emailKey: 'emailReposts',
    pushKey: 'pushReposts',
    description: t('settings.notif_reposts_desc', 'Quand un membre republie votre pensée.'),
  },
  {
    title: t('settings.notif_comments', 'Commentaires d’articles'),
    emailKey: 'emailComments',
    pushKey: 'pushComments',
    description: t('settings.notif_comments_desc', 'Quand un lecteur commente l’un de vos écrits.'),
  },
  {
    title: t('settings.notif_media', 'Activité des Médias'),
    emailKey: 'emailMedia',
    pushKey: 'pushMedia',
    description: t(
      'settings.notif_media_desc',
      'Invitations Média, arrivées de membres, nouvelles publications.'
    ),
  },
];

export default function NotificationsSettingsRoute() {
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const { data: prefs } = useQuery({
    queryKey: ['settings', 'notification-preferences'],
    queryFn: async () => {
      const res = await apiClient.getNotificationPreferences();
      if (!res.ok) throw new Error(res.error);
      return res.data.preferences;
    },
    staleTime: 60_000,
  });

  const setPref = async (key: keyof NotificationPreferenceFlags, value: boolean) => {
    if (!prefs || pendingKey) return;
    setPendingKey(key);
    try {
      const res = await apiClient.updateNotificationPreferences({ [key]: value });
      if (!res.ok) throw new Error(res.error);
      await queryClient.invalidateQueries({ queryKey: ['settings', 'notification-preferences'] });
      if (key.startsWith('push')) {
        await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }
    } catch (err) {
      Toast.show(
        err instanceof Error ? err.message : t('settings.notif_error', 'Impossible d’enregistrer'),
        'error'
      );
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <SettingsScreenShell
      title={t('settings.notifications', 'Notifications')}
      subtitle={t('settings.notifications_subtitle', 'Ce qui mérite votre attention')}
    >
      {sections.map((section) => {
        const pushVal = prefs?.[section.pushKey] ?? true;
        const emailVal = prefs?.[section.emailKey] ?? true;
        const disabled = pendingKey !== null;
        return (
          <SettingsSection key={section.title} title={section.title}>
            <View>
              <SettingsToggleRow
                label={t('settings.notif_push', 'Notifications App / Push')}
                value={pushVal}
                disabled={disabled}
                onChange={(next) => void setPref(section.pushKey, next)}
              />
              <SettingsRowSeparator />
              <SettingsToggleRow
                label={t('settings.notif_email', 'Alertes Email')}
                description={section.description}
                value={emailVal}
                disabled={disabled}
                onChange={(next) => void setPref(section.emailKey, next)}
              />
            </View>
          </SettingsSection>
        );
      })}
    </SettingsScreenShell>
  );
}
