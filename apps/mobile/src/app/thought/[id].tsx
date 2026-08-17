import { useLocalSearchParams } from 'expo-router';

import { ThreadScreen } from '@/features/thread/thread-screen';

export default function ThoughtRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ThreadScreen postId={id} />;
}
