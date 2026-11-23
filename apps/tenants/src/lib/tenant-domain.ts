// =====================================================================
// 🏷️ tenant-domain — un seul normaliseur pour l'hôte de publication
// =====================================================================
// 📖 Le segment `[domain]` arrive du routeur Next : décodé, mais **sans**
//    normalisation. Or un nom d'hôte est insensible à la casse (`MEDIA.qoe.fi`
//    est le même site que `media.qoe.fi`) et peut porter le point racine d'un
//    FQDN (`media.qoe.fi.`). Chaque page re-décodait l'hôte à sa façon ; une
//    seule d'entre elles passait en minuscules, donc la même visite pouvait
//    interroger deux publishers différents.
// =====================================================================

import { decodeUrlSegment } from '@qoe/config/article-url';

/**
 * Hôte de publication normalisé : décodé **une** fois, minuscules, sans point
 * racine. Ne lève jamais (un `%` littéral reste tel quel).
 */
export function normalizeTenantDomain(raw: string | null | undefined): string {
  // La casse est abaissée AVANT le décodage : `%2E` et `%2e` sont le même
  // échappement, alors qu'abaisser un reste d'échappement (`%2Eqoe` → `%2eqoe`)
  // changerait la valeur produite par l'unique décodage.
  return decodeUrlSegment((raw ?? '').trim().toLowerCase()).replace(/\.$/, '');
}
