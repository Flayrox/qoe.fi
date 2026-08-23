// =====================================================================
// 🔐 Auth — Validation du JWT via Supabase
// =====================================================================
// Plutôt que de gérer nous-mêmes JWKS (RS256/ES256) + le fallback HS256
// (`sb_secret_…`), on délègue la validation à Supabase :
//   GET {SUPABASE_URL}/auth/v1/user  avec `Authorization: Bearer <token>`
// Retourne l'utilisateur ou 401. C'est exactement la même source de vérité
// que le middleware de l'API Go (`internal/middleware/auth.go`).
// =====================================================================

export interface CollabUser {
  /** ID utilisateur (UUID Supabase / Prisma). */
  id: string;
  /** Nom affiché pour la présence / les curseurs. */
  name: string;
  /** Adresse email (fallback du nom). */
  email?: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<CollabUser | null>;
}

/**
 * Vérifie un JWT Supabase via introspection HTTP.
 * `fetch` est injectable pour les tests.
 */
export function createSupabaseVerifier(
  supabaseUrl: string,
  supabaseAnonKeyOrFetch: string | typeof fetch = '',
  fetchImpl: typeof fetch = fetch
): TokenVerifier {
  // Compat : ancien appel createSupabaseVerifier(url, fetchMock) → 2e arg est fetch
  let supabaseAnonKey = '';
  let fetchFn = fetchImpl;
  if (typeof supabaseAnonKeyOrFetch === 'function') {
    fetchFn = supabaseAnonKeyOrFetch as typeof fetch;
  } else {
    supabaseAnonKey = supabaseAnonKeyOrFetch as string;
  }
  return {
    async verify(token: string): Promise<CollabUser | null> {
      if (!token || !supabaseUrl) return null;

      const response = await fetchFn(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey || token,
        },
      });

      if (!response.ok) return null;

      let payload: Record<string, unknown>;
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        return null;
      }

      const id = typeof payload.sub === 'string' ? payload.sub : '';
      if (!id) return null;

      const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
      const email = typeof payload.email === 'string' ? payload.email : undefined;
      const name =
        (typeof meta.name === 'string' && meta.name) ||
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof payload.name === 'string' && payload.name) ||
        email ||
        'Éditeur';

      return { id, name, email };
    },
  };
}
