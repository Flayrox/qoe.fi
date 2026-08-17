// =====================================================================
// 💾 drafts.ts — Brouillons du composer (port de
//    .reference/bluesky/src/view/com/composer/drafts)
// =====================================================================
// Brouillons en mémoire (module-level) : sauvegarde/restauration d'un
// texte en cours de frappe. ⚠️ Persistance disque volontairement omise
// (pas d'async-storage dans le projet) — extension future.
// =====================================================================

export interface Draft {
  id: string;
  text: string;
  parentId?: string;
  repostId?: string;
  updatedAt: number;
}

const drafts = new Map<string, Draft>();

export function saveDraft(draft: Omit<Draft, 'id' | 'updatedAt'>): Draft {
  const id = draft.parentId ?? draft.repostId ?? 'new';
  const existing = drafts.get(id);
  const record: Draft = { ...draft, id, updatedAt: Date.now() };
  drafts.set(id, record);
  return record;
}

export function getDraft(id: string): Draft | undefined {
  const d = drafts.get(id);
  if (!d) return undefined;
  // Un brouillon vide ne sert à rien.
  if (!d.text.trim()) {
    drafts.delete(id);
    return undefined;
  }
  return d;
}

export function listDrafts(): Draft[] {
  return [...drafts.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteDraft(id: string) {
  drafts.delete(id);
}

export function clearDrafts() {
  drafts.clear();
}
