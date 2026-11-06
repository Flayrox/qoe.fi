// =====================================================================
// 📐 tokens — la densité de la console, décidée une fois
// =====================================================================
// Un outil d'exploitation se règle en pixels, pas en impressions : sidebar
// 232 px, item 32 px, barre 44 px, corps 13 px, ligne de tableau 40 px.
// Les composants de coquille importent ces classes au lieu de réinventer
// des paddings. Les valeurs restent des classes littérales pour que Tailwind
// les génère.
// =====================================================================

export const DENSITY = {
  /** Colonne de navigation (desktop). */
  sidebar: 'md:w-[232px]',
  /** Une entrée de navigation : 32 px de haut. */
  navItem: 'h-8 gap-2 rounded-md px-2 text-[13px] leading-5',
  navIcon: 'size-4 shrink-0',
  navSection: 'px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest',
  /** Barre supérieure : 44 px. */
  header: 'h-11',
  /** Zone de contenu : dense, pleine largeur. */
  content: 'px-6 py-5',
  /** Corps de texte de la console. */
  body: 'text-[13px] leading-5',
  /** Panneau sobre : un rayon, pas un effet. */
  panel: 'rounded-lg border border-border bg-card',
  /** Tableau : en-tête 36 px, ligne 40 px. */
  tableHead: 'h-9 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground',
  tableCell: 'px-3 align-middle',
  row: 'h-10',
  /** Identifiant technique : mono, chiffres alignés. */
  id: 'font-mono text-[11px] tabular-nums text-muted-foreground',
} as const;

/**
 * Un seul ton d'accent. Il sert aux ACTIONS (bouton primaire, lien d'action,
 * indicateur actif), jamais aux titres ni aux surtitres.
 */
export const ACCENT = {
  text: 'text-[#EE4B2B]',
  solid: 'bg-[#EE4B2B] text-white hover:bg-[#d8411f]',
  ring: 'focus-visible:ring-[#EE4B2B]/40',
  indicator: 'bg-[#EE4B2B]',
} as const;
