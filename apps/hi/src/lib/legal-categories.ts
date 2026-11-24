import { t } from '@lingui/core/macro';

// Libellés de catégorie des documents légaux, résolus au rendu (une table au
// module resterait figée dans la langue par défaut). Une catégorie inconnue
// garde sa valeur brute : la base peut en ajouter une avant nous.
export function getCategoryLabel(category: string): string {
  switch (category) {
    case 'legal':
      return t`Juridique`;
    case 'privacy':
      return t`Vie privée`;
    case 'commerce':
      return t`Paiements`;
    case 'creator':
      return t`Créateurs`;
    case 'security':
      return t`Sécurité`;
    case 'general':
      return t`Informations`;
    default:
      return category;
  }
}
