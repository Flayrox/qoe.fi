/**
 * 🔗 Go API Client — Proxy fin vers le backend Go (apps/api).
 * =====================================================================
 * Les server actions Next.js deviennent des proxies fins : elles gardent
 * leur contrat TS (ActionResult<T>, auth cookie) mais délèguent la logique
 * au backend Go via HTTP. Activé uniquement si QOE_API_URL est défini.
 *
 * ⚠️ Module serveur (importé uniquement par des server actions) — il n'est
 * PAS déclaré 'use server' car il exporte des constantes.
 * =====================================================================
 */

import { createClient } from '@qoe/supabase/server';

export const GO_API_URL: string | null = process.env.QOE_API_URL ?? null;

export function isGoEnabled(): boolean {
  return Boolean(GO_API_URL);
}

async function getAccessToken(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

/**
 * Appelle le backend Go avec le Bearer token Supabase de la session courante.
 * Lève une erreur si la réponse n'est pas 2xx.
 */
export async function goFetch<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  if (!GO_API_URL) {
    throw new Error('QOE_API_URL non configuré');
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${GO_API_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    // On attache le statut HTTP pour que les appelants distinguent un 404
    // attendu (ressource inexistante) d'une vraie erreur serveur.
    const err = new Error(body.error || `Go API ${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Appelle le backend Go et rend la réponse **brute**, en texte, sans la
 * désérialiser ni lever d'exception sur un statut non-2xx.
 *
 * Indispensable pour les pièces signées : la signature porte sur les octets
 * exacts du document, donc re-sérialiser le JSON ou échapper les caractères
 * invaliderait la preuve. L'appelant relaie le statut et les en-têtes tels
 * quels.
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
  if (!GO_API_URL) {
    throw new Error('QOE_API_URL non configuré');
  }
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: init?.accept ?? 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${GO_API_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  return {
    status: res.status,
    ok: res.ok,
    text: await res.text(),
    contentType: res.headers.get('content-type') ?? 'application/json; charset=utf-8',
    contentDisposition: res.headers.get('content-disposition') ?? '',
  };
}
