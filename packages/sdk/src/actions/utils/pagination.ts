// =====================================================================
// 📄 Pagination des endpoints Go `limit`/`offset`
// =====================================================================
// Une server action reçoit ses paramètres du client : `limit` peut arriver
// négatif, fractionnaire, `NaN` ou immense (« donne-moi tout »). Le Go borne
// aussi, mais un `limit=100000` transforme une page en export de base et un
// `limit=NaN` en 400 opaque. On normalise donc ici, à un seul endroit.
// =====================================================================

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Entier utilisable ou `undefined` (rejette NaN, Infinity, fractions < 1). */
function toInteger(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.trunc(value);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

/** `limit` borné à [1, MAX_PAGE_SIZE], `offset` ≥ 0. */
export function normalizePage(params: { limit?: number; offset?: number } = {}): {
  limit: number;
  offset: number;
} {
  const limit = toInteger(params.limit);
  const offset = toInteger(params.offset);
  return {
    limit: Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE),
    offset: Math.max(offset ?? 0, 0),
  };
}

/** Query string prête à concaténer (`?limit=20&offset=0`). */
export function pageQuery(params: { limit?: number; offset?: number } = {}): string {
  const { limit, offset } = normalizePage(params);
  return `?limit=${limit}&offset=${offset}`;
}
