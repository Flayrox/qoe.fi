import { NotFoundView } from '@qoe/ui';
import { getLanguage } from '@qoe/i18n/server';

// Les métadonnées sont rendues hors du provider i18n : on lit la langue de la
// requête, comme le fait chaque app (cf. `generateMetadata` du studio).
export async function generateMetadata() {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? 'Page introuvable — qoefi' : 'Page not found — qoefi',
    description: isFr
      ? 'L’article ou la page que vous cherchez est introuvable sur cette publication.'
      : 'The article or page you are looking for cannot be found on this publication.',
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function TenantNotFound() {
  return <NotFoundView />;
}
