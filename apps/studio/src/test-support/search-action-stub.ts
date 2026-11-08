// Stub de test : l'export `@qoe/sdk/actions/search` n'est exposé qu'aux
// conditions React Server ; Vitest le remplace par cette action inerte.
export async function searchAllAction() {
  return { ok: true as const, data: { articles: [] } };
}
