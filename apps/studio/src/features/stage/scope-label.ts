// =====================================================================
// scope-label — libellé du scope de page du Stage
// =====================================================================
// Le canvas affichait « Article · rubrique » quand le panneau des calques
// annonçait « Page · Accueil » sur la même page : deux libellés pour un seul
// état, dont un faux. Libellé unique, dérivé du scope réel.
// =====================================================================

export type StageScopePage = 'home' | 'article';

export function stageScopeLabel(page: StageScopePage, category: string | null): string {
  if (page !== 'article') return 'Accueil';
  return category ? `Article · ${category}` : 'Article';
}

export function stageScopeTitle(page: StageScopePage, category: string | null): string {
  return `Page · ${stageScopeLabel(page, category)}`;
}
