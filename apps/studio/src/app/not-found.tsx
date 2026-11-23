import type { Metadata } from 'next';
import { NotFoundView } from '@qoe/ui';
import { getLanguage } from '@qoe/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? 'Page introuvable — Studio qoefi' : 'Page not found — qoefi Studio',
    description: isFr
      ? 'Cette page du Studio qoefi est introuvable ou a été déplacée.'
      : 'This page of qoefi Studio cannot be found or has moved.',
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function StudioRootNotFound() {
  return <NotFoundView />;
}
