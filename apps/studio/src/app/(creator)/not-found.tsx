import { NotFoundView } from '@qoe/ui';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? t`Page introuvable — Studio qoefi` : t`Page not found — qoefi Studio`,
    description: isFr
      ? t`Cette page du Studio qoefi est introuvable ou a été déplacée.`
      : t`This page of qoefi Studio cannot be found or has moved.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function StudioCreatorNotFound() {
  return <NotFoundView />;
}
