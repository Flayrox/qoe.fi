// =====================================================================
// 🔗 Go API Client — mini-client local pour packages/auth
// =====================================================================
// Évite la circularité avec @qoe/sdk (qui dépend de @qoe/auth) : même
// contrat que packages/sdk/src/actions/utils/go-client.ts
// (QOE_API_URL, Bearer token Supabase, erreur avec statut HTTP).
// =====================================================================

import { createClient } from '@qoe/supabase/server';

/** Délai maximal d'un appel à l'API Go (une Server Action ne doit pas pendre). */
export const GO_API_TIMEOUT_MS = 10_000;

/**
 * Origine de l'API Go, lue **à l'appel** (et non à l'import) : en test ou en
 * script, une variable posée après le chargement du module doit compter.
 */
export function goApiUrl(): string | null {
  const raw = process.env.QOE_API_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

export function isGoEnabled(): boolean {
  return goApiUrl() !== null;
}

async function getAccessToken(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

export async function goFetch<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const apiUrl = goApiUrl();
  if (!apiUrl) {
    throw new Error('QOE_API_URL non configuré');
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // `cache` est une extension Next de RequestInit : portée par un objet typé
  // pour rester compilable sans les types Next (package partagé).
  const requestInit = {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    // Donnée personnelle : jamais mise en cache (ni Next, ni le runtime).
    cache: 'no-store' as const,
    signal: AbortSignal.timeout(GO_API_TIMEOUT_MS),
  };
  const res = await fetch(`${apiUrl}${path}`, requestInit);

  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(body.error || `Go API ${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
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
