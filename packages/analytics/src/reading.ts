// =====================================================================
// 📖 reading.ts — Logique pure du suivi de lecture (testable hors React)
// =====================================================================
// Ces règles vivaient dans deux blocs `useEffect` du hook et n'étaient
// vérifiées que par des copies recopiées dans les tests : le code réel du
// paquet n'était couvert par aucune suite. Elles sont désormais exportées,
// utilisées par le hook, et testées directement.
// =====================================================================

export type ReadingSource = 'feed' | 'subdomain' | 'public_profile' | 'direct';
export type ReadingStatus = 'BOUNCE' | 'SKIM' | 'READ_PARTIAL' | 'READ_COMPLETE';

/** Part du temps de lecture estimé en dessous de laquelle une lecture est un survol. */
const MIN_READING_RATIO = 0.35;
/** Profondeur de défilement à partir de laquelle une lecture est « complète ». */
const COMPLETE_SCROLL = 85;
/** Profondeur de défilement à partir de laquelle une lecture rapide est un survol. */
const SKIM_SCROLL = 80;
/** Seuil de sortie immédiate (rebond). */
const BOUNCE_DWELL_SECONDS = 10;
const BOUNCE_SCROLL = 25;
/** Profondeur minimale pour une lecture partielle. */
const PARTIAL_SCROLL = 25;

/**
 * 🏷️ Classe une session de lecture (BOUNCE / SKIM / READ_PARTIAL / READ_COMPLETE).
 * Source unique : le tick temps réel et le rapport de fin de session doivent
 * produire exactement le même verdict.
 */
export function classifyReadingStatus(
  dwellSeconds: number,
  scrollDepthPercent: number,
  readingTimeMinutes = 5
): ReadingStatus {
  const minReadingTime = Math.max(1, readingTimeMinutes) * 60 * MIN_READING_RATIO;

  if (dwellSeconds < BOUNCE_DWELL_SECONDS && scrollDepthPercent < BOUNCE_SCROLL) {
    return 'BOUNCE';
  }
  if (scrollDepthPercent >= SKIM_SCROLL && dwellSeconds < minReadingTime) {
    return 'SKIM';
  }
  if (scrollDepthPercent >= COMPLETE_SCROLL && dwellSeconds >= minReadingTime) {
    return 'READ_COMPLETE';
  }
  if (scrollDepthPercent >= PARTIAL_SCROLL) {
    return 'READ_PARTIAL';
  }
  return 'BOUNCE';
}

/** Hôtes racines exploités par le produit (production, recette, dev local). */
const APEX_HOSTS = ['qoe.fi', 'qoe.test', 'lvh.me'] as const;

/**
 * Sous-domaines du produit : jamais des publications de créateur.
 * Aligné sur les surfaces de `@qoe/config` (studio, admin, api, médias, collab).
 */
const PRODUCT_SUBDOMAINS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'assets',
  'auth',
  'billing',
  'collab',
  'core',
  'dashboard',
  'hi',
  'media',
  'search',
  'studio',
  'support',
  'tenants',
  'www',
]);

/**
 * 🌐 Hôte tenant d'une URL, ou `null` si c'est un hôte produit / une adresse
 * quelconque. `studio.qoe.fi` ou `api.qoe.fi` ne sont pas des publications :
 * les compter comme tenants faussait l'attribution des vues.
 */
export function tenantHostname(hostname: string): string | null {
  const host = (hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) {
    return null;
  }
  for (const apex of APEX_HOSTS) {
    if (host === apex) {
      return null;
    }
    if (host.endsWith(`.${apex}`)) {
      const label = host.slice(0, -(apex.length + 1));
      // Sous-domaine composé (a.b.qoe.fi) : toujours une publication.
      if (label.includes('.')) {
        return host;
      }
      return PRODUCT_SUBDOMAINS.has(label) ? null : host;
    }
  }
  return null;
}

export interface ReadingLocation {
  pathname: string;
  hostname: string;
  search?: string;
}

export interface ReadingProvenance {
  hostname: string | null;
  referrerUsername: string | null;
}

/**
 * 🧭 Résout la provenance fine : hostname du tenant + username du profil référent.
 * Formats de `ref`/`source` acceptés : `profile:simone`, `@simone`, `simone` ;
 * `/@simone` dans le chemin du profil public.
 */
export function resolveReadingProvenanceFrom({
  pathname,
  hostname,
  search = '',
}: ReadingLocation): ReadingProvenance {
  const params = new URLSearchParams(search);
  const refParam = params.get('ref') || params.get('source') || '';

  let referrerUsername: string | null = null;
  if (refParam.startsWith('profile:') || refParam.startsWith('@')) {
    referrerUsername = refParam.replace(/^(profile:|@)/, '') || null;
  } else if (!['feed', 'profile', 'author', 'direct'].includes(refParam) && refParam.length > 0) {
    referrerUsername = refParam;
  }

  if (!referrerUsername) {
    const profileMatch = /^\/@([a-z0-9-]+)/i.exec(pathname);
    if (profileMatch) {
      referrerUsername = profileMatch[1] ?? null;
    }
  }

  return { hostname: tenantHostname(hostname), referrerUsername };
}

export interface ReadingSourceInput {
  initialSource?: ReadingSource;
  pathname: string;
  hostname: string;
  search?: string;
}

/**
 * 🔎 Détermine la source d'entrée : `initialSource` explicite, `?ref=feed` ou
 * `/home`, `?ref=profile|author`, puis sous-domaine tenant, sinon direct.
 */
export function resolveReadingSource({
  initialSource,
  pathname,
  hostname,
  search = '',
}: ReadingSourceInput): ReadingSource {
  if (initialSource) {
    return initialSource;
  }
  const params = new URLSearchParams(search);
  const refParam = params.get('ref') || params.get('source');

  if (refParam === 'feed' || pathname.startsWith('/home')) {
    return 'feed';
  }
  if (refParam === 'profile' || refParam === 'author') {
    return 'public_profile';
  }
  return tenantHostname(hostname) ? 'subdomain' : 'direct';
}
