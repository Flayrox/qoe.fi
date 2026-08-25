// =====================================================================
// 🔌 Client API créateur qoe.fi — côté serveur uniquement.
// =====================================================================
// La clé API (qoe_live_…) ne quitte JAMAIS le serveur : toutes les
// récupérations de contenu se font dans des Server Components.

export const QOE_API_URL = process.env.QOE_API_URL ?? 'http://localhost:8080';
const QOE_API_KEY = process.env.QOE_API_KEY ?? '';

if (!QOE_API_KEY) {
  console.warn('[qoe] QOE_API_KEY manquante — crée une clé dans Studio → Développeur → Clés API');
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function creatorApi<T>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(`${QOE_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${QOE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    // Toujours frais : le front reflète le contenu publié en direct.
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }
  return { ok: true, data: body };
}

// ─── Types du contrat (docs/API_COMPLETE.md — Créateur v2) ─────────────

export interface CreatorMe {
  publication: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    heroText: string | null;
    subdomain: string | null;
    customDomain: string | null;
  };
  userId: string;
  scopes: string[];
}

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  readingTime: number;
  isPremium: boolean;
  publishedAt: string;
  authors: { id: string; username: string | null; name: string | null }[];
}

export interface ArticleFull extends ArticleSummary {
  contentHtml: string;
  /** Markdown généré depuis le HTML stocké — prêt pour un rendu MD. */
  contentMarkdown: string;
  tags: unknown[];
}
