// =====================================================================
// 🔗 Go API Client — mini-client local pour packages/auth
// =====================================================================
// Évite la circularité avec @qoe/sdk (qui dépend de @qoe/auth) :
// même contrat que packages/sdk/src/actions/utils/go-client.ts
// (QOE_API_URL, Bearer token Supabase, erreur avec statut HTTP).
// =====================================================================

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

export async function goFetch<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const apiUrl = GO_API_URL ?? process.env.QOE_API_URL;
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

  const res = await fetch(`${apiUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

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
