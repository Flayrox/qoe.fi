// =====================================================================
// 🔐 Résolution de l'URL Supabase — une seule règle, testée
// =====================================================================
// Pourquoi ce module existe : chaque client Supabase lisait directement
// `process.env.NEXT_PUBLIC_SUPABASE_URL` (navigateur, SSR, middleware, service
// role, SDK admin). Un `.env` de poste pointant le Supabase de l'infra
// partagée (`http://116.203.158.47:54321`) faisait donc :
//   • inliner cette origine dans les bundles navigateur servis en local
//     (mesuré : `POST /auth/v1/otp` vers le VPS depuis `/login`) ;
//   • faire résoudre l'auth (SSR, middleware, server actions) contre la
//     production pendant les e2e.
// Le schéma zod (`packages/config/src/env.ts`) n'imposait qu'une *forme*
// d'URL : une IP publique absolue le satisfaisait, donc aucune garde ne
// l'attrapait.
//
// Règle unique, jumelle de celle de l'analytics (`@qoe/analytics/script-url`) :
//
//   • URL Supabase vers la boucle locale (`http://127.0.0.1:54321`,
//     `http://localhost:54321` — stack `supabase start`) → conservée ;
//   • URL Supabase **distante** sur un build configuré pour une origine locale
//     (`NEXT_PUBLIC_APP_URL` = localhost / *.localhost / *.lvh.me / *.qoe.test)
//     → remplacée par le stack local : un environnement local ne peut pas
//     authentifier contre la production ;
//   • URL Supabase distante sur un build de production → honorée ;
//   • valeur absente, non-URL ou ambiguë → repli local, jamais propagée.
//
// La décision est prise sur des variables **inlinées au build**
// (`NEXT_PUBLIC_*`), identiques côté SSR et côté navigateur : aucun écart
// d'hydratation, contrairement à une détection via `window.location`.
//
// ⚠️ Ce module est importé par `storage.ts`, donc évalué au chargement de
// `next.config.ts`. Il doit rester **autonome** (aucun import de workspace) :
// le transpileur de config de Next 16 réécrit les imports de workspace en
// chemins relatifs erronés pour les dépendances imbriquées
// (`Cannot find module '../../packages/config/src/local-host'`).
// =====================================================================

/**
 * Stack Supabase local (`supabase start`), adresse par défaut de l'API.
 * `127.0.0.1` plutôt que `localhost` : pas de résolution DNS ni de bascule
 * IPv6 → IPv4 au moment de l'appel.
 */
export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

/** Hôtes considérés comme « poste local » (dev, test, e2e). */
function isLocalHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true;
  }
  return (
    host.endsWith('.localhost') ||
    host === 'lvh.me' ||
    host.endsWith('.lvh.me') ||
    host === 'qoe.test' ||
    host.endsWith('.qoe.test')
  );
}

/** Extrait l'hôte d'une URL absolue, `null` si la valeur n'en est pas une. */
function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * Résout l'URL d'API Supabase à utiliser.
 *
 * @param rawUrl valeur brute de `NEXT_PUBLIC_SUPABASE_URL` (inlinée au build)
 * @param appUrl valeur de `NEXT_PUBLIC_APP_URL` de la même build
 */
export function resolveSupabaseUrl(
  rawUrl: string | undefined | null,
  appUrl?: string | null
): string {
  const value = (rawUrl ?? '').trim();
  const host = hostnameOf(value);

  // Valeur absente ou non-URL : on ne propage rien, on replie sur le local.
  if (!host) return LOCAL_SUPABASE_URL;

  // Supabase local (ou derrière un domaine de dev) : joignable, on garde.
  if (isLocalHostname(host)) return value;

  // Build configuré pour une origine locale : jamais la production.
  if (isLocalHostname(hostnameOf(appUrl))) return LOCAL_SUPABASE_URL;

  return value;
}
