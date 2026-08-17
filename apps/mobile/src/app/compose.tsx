import { useLocalSearchParams } from 'expo-router';

import { ComposeScreen } from '@/features/compose/compose-screen';

// =====================================================================
// ✍️ Route /compose — Composer de pensée (modal).
// Paramètres optionnels :
//   - `parentId` + `replyingTo` → répondre à une pensée (fil).
//   - `repostId` + `quotedAuthor`/`quotedText` → CITER une pensée
//     (le contenu est publié avec un repostId référençant la pensée citée).
// Sans paramètre → nouvelle pensée.
// =====================================================================
export default function ComposeRoute() {
  const { parentId, replyingTo, repostId, quotedAuthor, quotedText } = useLocalSearchParams<{
    parentId?: string;
    replyingTo?: string;
    repostId?: string;
    quotedAuthor?: string;
    quotedText?: string;
  }>();
  return (
    <ComposeScreen
      parentId={parentId}
      replyingTo={replyingTo}
      repostId={repostId}
      quotedAuthor={quotedAuthor}
      quotedText={quotedText}
    />
  );
}
