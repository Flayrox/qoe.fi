import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/features/messages/conversation-screen';

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ConversationScreen conversationId={id} />;
}
