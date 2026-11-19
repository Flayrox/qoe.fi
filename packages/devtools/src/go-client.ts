// =====================================================================
// 🔗 Go API Client — mini-client local pour packages/devtools
// =====================================================================
// Même contrat que packages/sdk/src/actions/utils/go-client.ts
// (QOE_API_URL, Bearer token Supabase, erreur avec statut HTTP).
// Toutes les opérations DB du panneau devtools passent par l'API Go
// (module superadmin /v1/devtools/*) — plus aucun Prisma.
// =====================================================================

import { createClient } from '@qoe/supabase/server';

// Lu à chaque appel : QOE_API_URL peut être défini après le chargement du
// module (scripts, workers, Docker entrypoint, tests), et un `const` figé à
// l'import laissait alors le panneau croire que l'API Go est absente.
export function goApiUrl(): string | null {
  return process.env.QOE_API_URL ?? null;
}

export function isGoEnabled(): boolean {
  return Boolean(goApiUrl());
}

/** Budget d'un aller-retour devtools : un panneau de dev ne doit jamais pendre. */
const GO_FETCH_TIMEOUT_MS = 15_000;

async function getAccessToken(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

// Secret partagé de dev → le backend Go (mode devtools dev-only) accepte ce
// header x-qoe-internal-secret en fallback d'authentification, ce qui rend le
// panneau de dev utilisable sans session utilisateur ni enregistrement
// superadmin en base. Vide hors dev → aucune requête n'envoie ce header.
//
// ⚠️ En production le bypass Go est désactivé (DevOnlyAuth) et le JWT est la
// seule authentification : envoyer le header n'aurait aucun effet, mais
// transmettrait la clé service role Supabase (accès total à la base) sur le
// réseau à chaque appel. On ne la sort donc jamais d'un processus de dev.
function getInternalSecret(): string {
  if (process.env.NODE_ENV === 'production') return '';
  return process.env.QOE_INTERNAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export async function goFetch<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const apiUrl = goApiUrl();
  if (!apiUrl) {
    throw new Error('QOE_API_URL non configuré');
  }

  const [token, internalSecret] = await Promise.all([
    getAccessToken(),
    Promise.resolve(getInternalSecret()),
  ]);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (internalSecret) {
    headers['x-qoe-internal-secret'] = internalSecret;
  }

  const res = await fetch(`${apiUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(GO_FETCH_TIMEOUT_MS),
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
