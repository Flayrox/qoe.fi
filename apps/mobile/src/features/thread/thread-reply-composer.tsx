// =====================================================================
// 💬 ThreadReplyComposer — Réponse à une pensée (verre liquide morphant)
// =====================================================================
// Wrapper dédié du GlassComposer partagé (components/composer) : envoie
// une réponse via createThought(parentId) puis invalide les caches.
// Le visuel et la physique (morph 50→120, avatar qui se rétracte,
// suivi du clavier, reduceMotion) vivent dans GlassComposer.
// =====================================================================

import { useQueryClient } from '@tanstack/react-query';

import { GlassComposer } from '@/components/composer/glass-composer';
import { Avatar } from '@/components/thought/avatar';
import { useDrawer } from '@/components/drawer/drawer-context';
import { useAuth } from '@/features/auth/auth-provider';
import { useMe } from '@/hooks/use-me';
import { apiClient } from '@/lib/api';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';

export function ThreadReplyComposer({
  postId,
  replyingTo,
  parentContent,
}: {
  /** ID de la pensée à laquelle on répond */
  postId: string;
  /** Auteur de la pensée ciblée */
  replyingTo?: string | null;
  /** Contenu de la pensée ciblée */
  parentContent?: string | null;
}) {
  const queryClient = useQueryClient();
  const { openDrawer } = useDrawer();

  const { session } = useAuth();
  const { data: me } = useMe();
  const user = session?.user;
  const userAvatarProps = {
    name: me?.name || (user?.user_metadata?.full_name as string) || 'Utilisateur',
    username: me?.username || (user?.user_metadata?.username as string) || 'user',
    logoUrl: me?.logoUrl || (user?.user_metadata?.avatar_url as string | undefined),
  };

  const handleSubmit = async (text: string) => {
    const res = await apiClient.createThought(text.trim(), {
      parentId: postId,
    });

    if (!res.ok) {
      throw new Error(res.error || t('compose.error', "Impossible d'envoyer la réponse"));
    }

    // Actualisation des données
    await queryClient.invalidateQueries({ queryKey: feedKeys.all });
    await queryClient.invalidateQueries({ queryKey: feedKeys.thread(postId) });
  };

  return (
    <GlassComposer
      placeholder={
        replyingTo
          ? t('thread.reply_to_user', 'Répondre à @{user}…', { user: replyingTo })
          : t('thread.write_reply', 'Écrire votre réponse…')
      }
      onSubmit={handleSubmit}
      avatar={<Avatar user={userAvatarProps} sizeNumber={32} />}
      onAvatarPress={() => {
        playHaptic('Light');
        openDrawer();
      }}
      avatarAccessibilityLabel="Menu"
    />
  );
}
