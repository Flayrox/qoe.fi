import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import catalogData from './catalog.json';
import type { Catalog } from './catalog-types';
import { UiLab } from './ui-lab';

export const metadata: Metadata = {
  title: 'UI Lab — qoefi Studio',
};

// 🧪 Page de revue UI réservée au développement : elle n'existe qu'en local.
//    Régénérer l'inventaire après ajout de composants : `pnpm ui:catalog`.
export default function UiLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return <UiLab catalog={catalogData as Catalog} />;
}
