/**
 * 🔗 Go API Client — Proxy fin vers le backend Go (apps/api).
 * =====================================================================
 * Les server actions Next.js deviennent des proxies fins : elles gardent
 * leur contrat TS (ActionResult<T>, auth cookie) mais délèguent la logique
 * au backend Go via HTTP. Activé uniquement si QOE_API_URL est défini.
 *
 * 🧩 Un seul chemin réseau (`goRequest`) derrière quatre formes de réponse :
 *    JSON, multipart, binaire, texte brut. Toute évolution (timeout, en-têtes,
 *    traçage) se fait à un seul endroit.
 *
 * ⚠️ Module serveur (importé uniquement par des server actions) — il n'est
 * PAS déclaré 'use server' car il exporte des constantes.
 * =====================================================================
 */

/** Délai par défaut d'un appel Go (ms) : une Server Action ne doit pas pendre. */
export const DEFAULT_GO_TIMEOUT_MS = 10_000;

/**
 * Origine de l'API Go, lue **à l'appel** : une variable posée après le
 * chargement du module (tests, scripts, SSR réutilisé) doit compter.
 */
export function goApiUrl(): string | null {
  const raw = process.env.QOE_API_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

export function isGoEnabled(): boolean {
  return goApiUrl() !== null;
}

/** Délai configurable (`QOE_API_TIMEOUT_MS`), borné à une valeur exploitable. */
export function goTimeoutMs(): number {
  const raw = Number.parseInt(process.env.QOE_API_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GO_TIMEOUT_MS;
}

async function getAccessToken(): Promise<string> {
  // Import dynamique volontaire : `@qoe/supabase/server` dépend de
  // `next/headers` (serveur uniquement). Un import statique ici ferait fuir ce
  // module dans les bundles navigateur dès qu'un composant client importe une
  // server action (le traceur Turbopack suit les imports statiques) et casserait
  // `next build`. En dynamique, le module ne charge que sur le serveur, au
  // moment de l'exécution de l'action — comportement strictement identique.
  const { createClient } = await import('@qoe/supabase/server');
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

interface GoRequestInit {
  method?: string;
  body?: unknown;
  /** Corps déjà encodé (FormData) : ne pas le sérialiser en JSON. */
  rawBody?: BodyInit;
  /** `false` pour un envoi multipart (fetch doit générer le boundary). */
  json?: boolean;
  accept?: string;
}

/**
 * Exécute la requête HTTP et rend la `Response` brute.
 * Lève si l'API Go n'est pas configurée (erreur de déploiement explicite).
 */
async function goRequest(path: string, init: GoRequestInit = {}): Promise<Response> {
  const apiUrl = goApiUrl();
  if (!apiUrl) {
    throw new Error('QOE_API_URL non configuré');
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (init.json !== false) {
    headers['Content-Type'] = 'application/json';
  }
  if (init.accept) {
    headers.Accept = init.accept;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body:
      init.rawBody !== undefined
        ? init.rawBody
        : init.body !== undefined
          ? JSON.stringify(init.body)
          : undefined,
    // Donnée personnelle : jamais de cache (ni Next, ni le runtime).
    cache: 'no-store',
    signal: AbortSignal.timeout(goTimeoutMs()),
  });
}

/**
 * Appelle le backend Go avec le Bearer token Supabase de la session courante.
 * Lève une erreur si la réponse n'est pas 2xx.
 *
 * Un `403` du garde d'autorisation transporte son `code` sur l'erreur levée
 * (voir `./authz` pour les helpers côté client).
 */
export async function goFetch<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await goRequest(path, init);

  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    action?: string;
    level?: string;
  };
  if (!res.ok) {
    // On attache le statut HTTP pour que les appelants distinguent un 404
    // attendu (ressource inexistante) d'une vraie erreur serveur.
    const err = new Error(body.error || `Go API ${res.status}`) as Error & {
      status?: number;
      code?: string;
      action?: string;
      level?: string;
    };
    err.status = res.status;
    // Refus du garde d'autorisation (apps/api/internal/authz) : le motif est
    // transporté jusqu'au client. `safeAction` propage déjà `e.code` dans
    // `ActionResult.error.code`, donc les actions n'ont rien à faire de plus.
    // Le corps fait foi ; les en-têtes servent de repli si un proxy a réécrit
    // le JSON.
    const authzCode = body.code || res.headers.get('x-qoe-authz-code') || undefined;
    if (authzCode) err.code = authzCode;
    if (body.action) err.action = body.action;
    const authzLevel = body.level || res.headers.get('x-qoe-authz-level') || undefined;
    if (authzLevel) err.level = authzLevel;
    throw err;
  }
  return body;
}

/**
 * Charge le profil utilisateur courant (`GET /v1/me`).
 * Si l'utilisateur n'est pas encore synchronisé dans Postgres (404),
 * exécute la synchronisation (`POST /v1/me/sync`) puis ré-exécute `GET /v1/me`.
 */
export async function fetchMeWithSync<T = Record<string, unknown>>(): Promise<T> {
  try {
    return await goFetch<T>('/v1/me');
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      await goFetch<{ created: boolean }>('/v1/me/sync', { method: 'POST' });
      return await goFetch<T>('/v1/me');
    }
    throw err;
  }
}

/**
 * Appelle le backend Go en **multipart** (upload de fichier) avec le Bearer
 * token de la session courante. Le `Content-Type` n'est volontairement PAS
 * posé : `fetch` génère le boundary lui-même (le fixer casserait le parse
 * côté Go). Mêmes garanties que `goFetch` (statut, `code` transporté).
 */
export async function goFetchUpload<T = Record<string, unknown>>(
  path: string,
  form: FormData
): Promise<T> {
  const res = await goRequest(path, { method: 'POST', rawBody: form, json: false });

  const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    const err = new Error(body.error || `Go API ${res.status}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    if (body.code) err.code = body.code;
    throw err;
  }
  return body;
}

/**
 * Appelle le backend Go et rend les octets BRUTS (couvertures, pièces
 * binaires) — jamais de JSON.parse sur un JPEG. Ne lève pas sur un statut
 * non-2xx : l'appelant relaie le statut tel quel.
 */
export async function goFetchBinary(path: string): Promise<{
  status: number;
  ok: boolean;
  contentType: string;
  bytes: ArrayBuffer;
}> {
  const res = await goRequest(path);
  return {
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    bytes: await res.arrayBuffer(),
  };
}

/**
 * Appelle le backend Go et rend la réponse **brute**, en texte, sans la
 * désérialiser ni lever d'exception sur un statut non-2xx.
 *
 * Indispensable pour les pièces signées : la signature porte sur les octets
 * exacts du document, donc re-sérialiser le JSON ou échapper les caractères
 * invalides invaliderait la preuve. L'appelant relaie le statut et les
 * en-têtes tels quels.
 */
export async function goFetchRaw(
  path: string,
  init?: { method?: string; body?: unknown; accept?: string }
): Promise<{
  status: number;
  ok: boolean;
  text: string;
  contentType: string;
  contentDisposition: string;
}> {
  const res = await goRequest(path, {
    method: init?.method,
    body: init?.body,
    accept: init?.accept ?? 'application/json',
  });

  return {
    status: res.status,
    ok: res.ok,
    text: await res.text(),
    contentType: res.headers.get('content-type') ?? 'application/json; charset=utf-8',
    contentDisposition: res.headers.get('content-disposition') ?? '',
  };
}
