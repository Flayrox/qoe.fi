// =====================================================================
// 🚫 onboarding/lib/reserved-subdomains.ts — refus des sous-domaines réservés
// =====================================================================
// F160 — le wizard tenait sa propre copie de la liste (26 entrées) : elle
// ignorait `collab`, `core`, `tenants`, `hi`, `assets`, `landing` ainsi que
// quatorze noms refusés par le serveur. Une seule source désormais :
// `@qoe/config/tenant`, alignée sur `identifier.reserved` (Go).
//
// Import par le sous-chemin `/tenant` : le barrel `@qoe/config` charge `env`
// (validation Zod) et n'a pas sa place dans un composant client.
// =====================================================================

import { RESERVED_SUBDOMAINS } from '@qoe/config/tenant';

const RESERVED = new Set<string>(RESERVED_SUBDOMAINS);

/** Vrai si le sous-domaine est réservé par la plateforme (serveur ou produit). */
export function isReservedSubdomain(candidate: string): boolean {
  return RESERVED.has(candidate);
}
