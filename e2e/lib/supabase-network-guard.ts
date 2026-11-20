// =====================================================================
// 🔒 e2e/lib/supabase-network-guard.ts — aucune page locale vers l'infra
// =====================================================================
// Pourquoi ce fichier existe : la règle « un build local ne vise jamais le
// Supabase de production » est portée par `@qoe/supabase/url` (résolveur
// unique). Ce module en fait une **preuve réseau** : on observe toutes les
// requêtes émises par une page servie en local et on refuse
//
//   • toute requête vers l'IP publique de l'infra partagée
//     (`116.203.158.47` — analytics, Supabase, API : peu importe le port) ;
//   • tout appel Supabase (`:54321`) qui ne serait pas la boucle locale.
//
// Un `.env` de poste peut donc pointer le VPS : si le code perdait la règle,
// ces assertions passeraient au rouge au lieu de laisser les tests verts en
// tapant la production.
// =====================================================================

import { expect, type Page } from '@playwright/test';

/** IP publique de l'infra partagée : jamais joignable depuis une page locale. */
export const SHARED_INFRA_HOST = '116.203.158.47';

/** Un port `:54321` est un Supabase : seule la boucle locale est acceptable. */
const LOCAL_SUPABASE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):54321(\/|$)/i;

export interface OutgoingWatch {
  /** Toutes les URLs demandées depuis l'ouverture de la page. */
  readonly urls: string[];
  /** Sous-ensemble Supabase (`:54321`), utile pour citer l'origine utilisée. */
  supabaseUrls(): string[];
  /** Échoue si une seule requête vise l'infra partagée. */
  assertNoSharedInfra(): void;
  /** Échoue si un appel Supabase sort de la boucle locale. */
  assertSupabaseLocal(): void;
}

/**
 * Observe les requêtes sortantes de `page`.
 * À appeler **avant** la navigation : Playwright n'attrape que le futur.
 */
export function watchOutgoing(page: Page): OutgoingWatch {
  const urls: string[] = [];
  page.on('request', (req) => urls.push(req.url()));
  // Les échecs réseau sont journalisés : sans eux, un `ECONNREFUSED` en cours
  // de parcours ne dit pas **quelle** URL a été refusée.
  page.on('requestfailed', (req) =>
    console.log(`[réseau] échec ${req.url()} → ${req.failure()?.errorText ?? 'inconnu'}`)
  );
  const supabaseUrls = () => urls.filter((url) => url.includes(':54321'));

  return {
    urls,
    supabaseUrls,
    assertNoSharedInfra() {
      const hits = urls.filter((url) => url.includes(SHARED_INFRA_HOST));
      expect(
        hits,
        `requête(s) vers l'infra partagée ${SHARED_INFRA_HOST} depuis une page locale :\n${hits.join('\n')}`
      ).toEqual([]);
    },
    assertSupabaseLocal() {
      const remote = supabaseUrls().filter((url) => !LOCAL_SUPABASE.test(url));
      expect(
        remote,
        `appel(s) Supabase hors boucle locale depuis une page locale :\n${remote.join('\n')}`
      ).toEqual([]);
    },
  };
}

/**
 * Ouvre la racine d'une app en gardant l'observation des requêtes.
 *
 * Une app protégée (studio, admin) redirige vers le login du core, qui n'est
 * pas lancé par le job `e2e-apps` : la navigation s'arrête alors sur la
 * redirection. Ce n'est pas un échec pour cette preuve — la requête de
 * redirection est déjà capturée — donc on journalise et on continue, au lieu
 * de perdre le contrôle du trafic émis.
 */
export async function openAppRoot(page: Page, label: string, path = '/'): Promise<OutgoingWatch> {
  const watch = watchOutgoing(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' }).catch((error: Error) => {
    console.log(`[${label}] navigation interrompue après redirection : ${error.message}`);
  });
  return watch;
}

/**
 * Journalise et vérifie le trafic Supabase observé.
 * Le log est volontairement bavard : un run vert doit dire **quelle** origine a
 * été utilisée, pas seulement compter les tests.
 */
export function assertSupabaseTraffic(label: string, watch: OutgoingWatch): void {
  const supabase = watch.supabaseUrls();
  console.log(
    `[${label}] réseau : ${watch.urls.length} requête(s), ${supabase.length} Supabase` +
      (supabase.length > 0 ? ` → ${supabase.join(' | ')}` : ' (aucun appel Supabase)')
  );
  watch.assertNoSharedInfra();
  watch.assertSupabaseLocal();
}
