import { NotFoundView } from '@qoe/ui';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton, et les deux variantes restent littérales (même
// règle que le not-found racine du studio).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? 'Page introuvable — qoefi' : 'Page not found — qoefi',
    description: isFr
      ? 'La page que vous cherchez n’existe pas ou a été déplacée.'
      : 'The page you are looking for does not exist or has moved.',
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function HiNotFound() {
  return <NotFoundView />;
}
