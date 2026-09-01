// =====================================================================
// 📄 post/[id]/[kind] — Engagement d'un post (likes | reposts | quotes)
// =====================================================================

import { useLocalSearchParams, Stack } from 'expo-router';

import { EngagementScreen, type EngagementKind } from '@/features/engagements/engagement-screen';
import { t } from '@/lib/i18n';

const TITLES: Record<EngagementKind, string> = {
  likes: 'J’aime',
  reposts: 'Reposts',
  quotes: 'Citations',
};

export default function PostEngagementRoute() {
  const params = useLocalSearchParams<{ id: string; kind: string }>();
  const kind = (
    params.kind === 'reposts' || params.kind === 'quotes' ? params.kind : 'likes'
  ) as EngagementKind;

  return (
    <>
      <Stack.Screen options={{ title: t('engagement.title', TITLES[kind]) }} />
      <EngagementScreen postId={params.id} kind={kind} />
    </>
  );
}
