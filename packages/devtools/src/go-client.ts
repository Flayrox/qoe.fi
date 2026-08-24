// =====================================================================
// 🔗 Go API Client — mini-client local pour packages/devtools
// =====================================================================
// Même contrat que packages/sdk/src/actions/utils/go-client.ts
// (QOE_API_URL, Bearer token Supabase, erreur avec statut HTTP).
// Toutes les opérations DB du panneau devtools passent par l'API Go
// (module superadmin /v1/devtools/*) — plus aucun Prisma.
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
