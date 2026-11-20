import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { devRoutesEnabled } from '@/lib/dev-routes';
import catalogData from './catalog.json';
import type { Catalog } from './catalog-types';
import { UiLab } from './ui-lab';

export const metadata: Metadata = {
  title: 'UI Lab — qoefi Studio',
};

// 🧪 Page de revue UI réservée au développement : elle n'existe qu'en local.
//    Régénérer l'inventaire après ajout de composants : `pnpm ui:catalog`.
export default function UiLabPage() {
  // Même drapeau que le middleware et `/dev/editor-check` : le lab doit
  // rester atteignable dans le build E2E, sinon les captures de référence
  // n'ont plus de page à photographier.
  if (!devRoutesEnabled()) notFound();

  return <UiLab catalog={catalogData as Catalog} />;
}
