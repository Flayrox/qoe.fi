// =====================================================================
// ➕ ThreadFollowButton — Bouton « Suivre » du post focus d'un fil
//    (port de .reference/bluesky/.../ThreadItemAnchorFollowButton.tsx)
// =====================================================================
// Résout la publication de l'auteur par son handle (GET /v1/users/{handle})
// pour obtenir le publicationId + l'état `isFollowing`, puis toggle le suivi
// (POST /v1/users/{publicationId}/follow). Masqué pour ses propres posts.
// =====================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { userKeys } from '@qoe/api-client/mobile';

export function ThreadFollowButton({
  authorId,
  username,
}: {
  /** userId de l'auteur (pour masquer le bouton sur ses propres posts). */
  authorId: string;
  /** Handle de l'auteur (résolution publication → publicationId). */
  username: string;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const [followingOverride, setFollowingOverride] = useState<boolean | null>(null);

  const { data: profile } = useQuery({
    queryKey: userKeys.profile(username),
    queryFn: async () => {
      const res = await apiClient.getUserProfile(username);
      if (!res.ok) return null;
      return res.data;
    },
    enabled: !!username,
  });

  // C'est mon propre post → pas de bouton Suivre.
  if (me && authorId && me.id === authorId) return null;
  if (!username || !profile) return null;

  const isFollowing = followingOverride ?? profile.isFollowing ?? false;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setFollowingOverride(!isFollowing);
    try {
      const res = await apiClient.toggleFollowUser(profile.id);
      if (res.ok) {
        setFollowingOverride(res.data.following);
        await queryClient.invalidateQueries({ queryKey: userKeys.profile(username) });
      } else {
        setFollowingOverride(null);
      }
    } catch {
      setFollowingOverride(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={() => void toggle()}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isFollowing
            ? theme.backgroundSelected
            : pressed
              ? theme.backgroundSelected
              : theme.primary,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={isFollowing ? theme.text : '#ffffff'} />
      ) : (
        <ThemedText type="smallBold" style={{ color: isFollowing ? theme.text : '#ffffff' }}>
          {isFollowing ? t('profile.following', 'Suivi') : t('profile.follow', 'Suivre')}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
});
