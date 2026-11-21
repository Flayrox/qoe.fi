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

const DEFAULT_INTROSPECTION_TIMEOUT_MS = 5_000;

/**
 * Vérifie un JWT Supabase via introspection HTTP.
 * `fetch` est injectable pour les tests.
 */
export function createSupabaseVerifier(
  supabaseUrl: string,
  supabaseAnonKeyOrFetch: string | typeof fetch = '',
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_INTROSPECTION_TIMEOUT_MS
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
      if (!token) {
        console.warn('[collab-server] Jeton absent : le client n’a envoyé aucun JWT.');
        return null;
      }
      if (!supabaseUrl) {
        console.warn('[collab-server] SUPABASE_URL absente : introspection impossible.');
        return null;
      }

      let response: Response;
      try {
        response = await fetchFn(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey || token,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error: unknown) {
        console.warn('[collab-server] Introspection Supabase indisponible ou expirée :', error);
        return null;
      }

      if (!response.ok) {
        console.warn(
          `[collab-server] Introspection refusée (HTTP ${response.status}) — ` +
            `jeton de ${token.length} caractères.`
        );
        return null;
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        return null;
      }
      // Un 200 dont le corps n'est pas l'utilisateur attendu (interstitiel de
      // proxy, page d'erreur servie en 200, `null`) refusait jusqu'ici par une
      // exception (`payload.id` sur `null`) au lieu d'un refus propre.
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.warn('[collab-server] Introspection Supabase : réponse inattendue (non-objet).');
        return null;
      }
      const payload = parsed as Record<string, unknown>;

      // GoTrue `/auth/v1/user` renvoie `id` ; on conserve `sub` en repli pour compatibilité JWT.
      const id =
        (typeof payload.id === 'string' && payload.id) ||
        (typeof payload.sub === 'string' && payload.sub) ||
        '';
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
