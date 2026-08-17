// =====================================================================
// 👥 Route /user/[username]/follow?tab=followers|following
// Liste des abonnés / abonnements d'un profil (porté des onglets Bluesky
// ProfileFollowers / ProfileFollowing).
// =====================================================================

import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';

import { FollowListScreen, type FollowTab } from '@/features/profile/follow-list-screen';
import { t } from '@/lib/i18n';

export default function FollowRoute() {
  const { username, tab } = useLocalSearchParams<{ username: string; tab?: string }>();
  const followTab: FollowTab = tab === 'following' ? 'following' : 'followers';

  return (
    <>
      <Stack.Screen
        options={{
          title:
            followTab === 'following'
              ? t('profile.following_tab', 'Abonnements')
              : t('profile.followers', 'Abonnés'),
        }}
      />
      <FollowListScreen username={username} tab={followTab} />
    </>
  );
}
