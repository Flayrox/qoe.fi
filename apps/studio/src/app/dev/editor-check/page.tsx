import { notFound } from 'next/navigation';
import { EditorCheckClient } from './EditorCheckClient';

export const metadata = {
  title: 'Editor check — qoefi Studio',
};

// 🧪 Banc de non-régression de l'éditeur : il monte le VRAI composant Editor,
// sans session ni API. La route n'existe qu'en développement et sert de cible
// stable à `e2e/studio-editor-fixtures.spec.ts`.
export default function EditorCheckPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <EditorCheckClient />;
}
