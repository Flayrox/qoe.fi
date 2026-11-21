// =====================================================================
// 🩺 Copie de l'état d'autorisation — un mode inconnu ne se devine pas
// =====================================================================
// L'écran de santé concluait « observation » dès que la sonde se taisait :
// `health === null` tombait dans la branche par défaut et affirmait que les
// refus n'étaient pas appliqués. C'est l'inverse d'une page de santé — elle
// annonçait un état qu'elle n'avait pas lu. Ces trois libellés distinguent
// « observé », « armé » et « illisible ».
// =====================================================================

import type { PlatformHealth } from '@/lib/admin-infra-data';

export interface AuthzModeCopy {
  badge: string;
  label: string;
  detail: string;
}

export function describeAuthzMode(health: PlatformHealth | null | undefined): AuthzModeCopy {
  if (!health) {
    return {
      badge: 'état inconnu',
      label: 'illisible',
      detail: 'Sonde d’autorisation indisponible : le mode appliqué ne peut pas être affirmé.',
    };
  }
  if (health.mode === 'enforce') {
    return {
      badge: 'refus armé',
      label: 'refus',
      detail: 'Une capacité manquante répond 403.',
    };
  }
  return {
    badge: 'observation',
    label: 'observation',
    detail: 'Les refus sont journalisés, pas encore appliqués.',
  };
}
