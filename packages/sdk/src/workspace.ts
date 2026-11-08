// =====================================================================
// 🎛️ Workspace — cookie actif partagé (Studio)
// =====================================================================
// Pur (aucun import Next) : utilisable côté serveur ET côté client. Le
// résolveur serveur vit dans `actions/workspace` ; ce module ne fait que
// parser/sérialiser la référence { type, id } pour éviter six copies du même
// JSON.parse dans le Studio.
// =====================================================================

export const WORKSPACE_COOKIE = 'qoe_active_workspace';

export type WorkspaceType = 'PERSONAL' | 'MEDIA';

export interface WorkspaceRef {
  type: WorkspaceType;
  id: string;
}

/**
 * Parse le cookie `qoe_active_workspace`.
 * Tolère la valeur encodée ou brute ; refuse tout type inconnu et tout id vide.
 */
export function parseWorkspaceCookie(raw: string | null | undefined): WorkspaceRef | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { type?: unknown; id?: unknown };
    if (parsed.type !== 'PERSONAL' && parsed.type !== 'MEDIA') return null;
    if (typeof parsed.id !== 'string' || parsed.id.trim().length === 0) return null;
    return { type: parsed.type, id: parsed.id };
  } catch {
    return null;
  }
}

/** Sérialise une référence de workspace pour `document.cookie` / une réponse. */
export function serializeWorkspaceCookie(ref: WorkspaceRef): string {
  return encodeURIComponent(JSON.stringify({ type: ref.type, id: ref.id }));
}
