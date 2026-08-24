// =====================================================================
// 📝 PostContent — Corps d'une pensée (port de Bluesky PostContent /
//    PostFeedItem → contenu, image, embed, poll, citation, badge)
// =====================================================================
// Source unique du rendu du corps d'un post, partagée par :
//   - la carte feed (`ThoughtCard`),
//   - la carte de fil compacte (`ThreadPost`),
//   - le post focus agrandi (`ThreadAnchorCard`).
// Garantit que sondages / images / pièces jointes / citations / liens
// s'affichent identiquement partout (plus de rendu dégradé dans le fil).
// =====================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Lightbox } from '@/components/lightbox/lightbox';
import { ThemedText } from '@/components/themed-text';
import { ContentHider } from '@/components/thought/content-hider';
import { ExternalEmbedFromText } from '@/components/thought/external-embed';
import { QuotedThoughtCard } from '@/components/thought/quoted-thought-card';
import { RichText } from '@/components/thought/rich-text';
import { ShowMoreTextButton } from '@/components/thought/show-more-text-button';
import { WhoCanReplyBadge } from '@/components/thought/who-can-reply';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';
import type { NormalizedThought } from './normalize';

// Parité Bluesky src/lib/constants.ts : MAX_POST_LINES = 25.
const MAX_POST_LINES = 25;

function countLines(text: string | undefined | null): number {
  if (!text) return 0;
  return text.split('\n').length;
}

function PollDisplay({
  thoughtId,
  poll,
}: {
  thoughtId: string;
  poll: NonNullable<NormalizedThought['poll']>;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [localVote, setLocalVote] = useState<string | null | undefined>(undefined);
  const userVotedOptionId = localVote !== undefined ? localVote : poll.userVotedOptionId;
  const total = poll.totalVotes;

  const vote = useMutation({
    mutationFn: async ({ optionId, unvote }: { optionId: string; unvote?: boolean }) => {
      if (unvote) {
        const res = await apiClient.unvotePoll(thoughtId);
        if (!res.ok) throw new Error(res.error);
        return res.data;
      }
      const res = await apiClient.votePoll(thoughtId, optionId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onMutate: ({ optionId, unvote }) => setLocalVote(unvote ? null : optionId),
    onError: () => setLocalVote(undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
    },
  });

  return (
    <View style={styles.poll}>
      {poll.options.map((opt) => {
        const isMine = userVotedOptionId === opt.id;
        const pct = total > 0 ? Math.round((opt.voteCount / total) * 100) : 0;
        return (
          <Pressable
            key={opt.id}
            onPress={() => {
              if (poll.isExpired || vote.isPending) return;
              if (isMine) vote.mutate({ optionId: opt.id, unvote: true });
              else vote.mutate({ optionId: opt.id });
            }}
            disabled={poll.isExpired || vote.isPending}
            style={({ pressed }) => [
              styles.pollOption,
              {
                borderColor: isMine ? theme.primary : theme.border,
                backgroundColor: isMine ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)',
              },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.pollBarWrap}>
              <View
                style={[
                  styles.pollBar,
                  {
                    width: `${pct}%`,
                    backgroundColor: isMine ? theme.primary : theme.backgroundSelected,
                  },
                ]}
              />
            </View>
            <View style={styles.pollOptionRow}>
              <ThemedText type="small" numberOfLines={1} style={styles.pollOptionText}>
                {isMine ? '✓ ' : ''}
                {opt.text}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {pct}%
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {poll.isExpired
          ? t('poll.ended', 'Sondage terminé')
          : `${total} ${t('poll.votes', 'votes')}`}
      </ThemedText>
    </View>
  );
}

export function PostContent({
  post,
  quoted,
  big = false,
  truncate = true,
  onPress,
}: {
  /** Post à afficher (déjà résolu repost/citation par `resolveDisplay`). */
  post: NormalizedThought;
  /** Pensée citée à afficher en carte sous le texte (citation). */
  quoted?: NormalizedThought | null;
  /** Texte agrandi (post focus) vs compact (feed / réponse). */
  big?: boolean;
  /** Autorise la troncature « Voir plus » (désactivée sur le post focus). */
  truncate?: boolean;
  /** Tap sur le texte → ouvrir le fil. */
  onPress?: () => void;
}) {
  const theme = useTheme();
  const [limitLines, setLimitLines] = useState(
    () => truncate && countLines(post.content) >= MAX_POST_LINES
  );
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const showMore = truncate && countLines(post.content) >= MAX_POST_LINES;
  const bodyStyle = big ? styles.bodyBig : styles.body;

  return (
    <View>
      <ContentHider hidden={!!post.isHiddenByAuthor}>
        {post.content ? (
          <View>
            <Pressable onPress={onPress} disabled={!onPress}>
              <RichText
                value={post.content}
                style={bodyStyle}
                authorHandle={post.author.username}
                numberOfLines={truncate && limitLines ? MAX_POST_LINES : undefined}
              />
            </Pressable>
            {showMore ? (
              <ShowMoreTextButton expanded={!limitLines} onPress={() => setLimitLines((v) => !v)} />
            ) : null}
          </View>
        ) : null}
      </ContentHider>

      {post.imageUrl ? (
        <Pressable onPress={() => setLightboxUri(post.imageUrl)}>
          <Image
            source={{ uri: post.imageUrl }}
            style={[styles.image, { backgroundColor: theme.backgroundSelected }]}
            contentFit="cover"
            transition={200}
          />
        </Pressable>
      ) : (
        <ExternalEmbedFromText text={post.content} />
      )}

      {post.attachments && post.attachments.length > 0 ? (
        <View style={styles.attachments}>
          {post.attachments.slice(0, 4).map((att) => (
            <Pressable key={att.id || att.url} onPress={() => setLightboxUri(att.url)}>
              <Image
                source={{ uri: att.url }}
                style={[styles.attachment, { backgroundColor: theme.backgroundSelected }]}
                contentFit="cover"
                transition={200}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {post.poll ? <PollDisplay thoughtId={post.id} poll={post.poll} /> : null}

      {quoted ? <QuotedThoughtCard post={quoted} /> : null}

      <WhoCanReplyBadge restriction={post.replyRestriction} />

      <Lightbox
        visible={!!lightboxUri}
        uri={lightboxUri ?? ''}
        onClose={() => setLightboxUri(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: Spacing.one,
  },
  bodyBig: {
    fontSize: 17,
    lineHeight: 24,
    marginTop: Spacing.one,
  },
  image: {
    width: '100%',
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
    aspectRatio: 16 / 9,
  },
  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  attachment: {
    width: '48%',
    aspectRatio: 4 / 3,
    borderRadius: Spacing.two,
  },
  poll: {
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  pollOption: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    overflow: 'hidden',
  },
  pollBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.6,
  },
  pollBar: {
    height: '100%',
  },
  pollOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pollOptionText: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
