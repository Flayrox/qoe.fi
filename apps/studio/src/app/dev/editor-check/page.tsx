import { notFound } from 'next/navigation';
import { devRoutesEnabled } from '@/lib/dev-routes';
import { EditorCheckClient } from './EditorCheckClient';

export const metadata = {
  title: 'Editor check — qoefi Studio',
};

// 🧪 Banc de non-régression de l'éditeur : il monte le VRAI composant Editor,
// sans session ni API. La route n'existe qu'en développement et sert de cible
// stable à `e2e/studio-editor-fixtures.spec.ts`.
export default function EditorCheckPage() {
  // La route n'existe pas en production réelle, mais le job E2E sert un build
  // (`PLAYWRIGHT_APPS_PROD=1` → `next start`) : il l'active au build via
  // QOE_E2E_DEV_ROUTES=1. Sans ce drapeau, le banc reste un 404.
  if (!devRoutesEnabled()) notFound();

  return <EditorCheckClient />;
}
