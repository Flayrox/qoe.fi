// =====================================================================
// 📐 tokens — la densité de la console, décidée une fois
// =====================================================================
// Un outil d'exploitation se règle en pixels, pas en impressions : sidebar
// 208 px, item 28 px, barre 40 px, corps 12,5 px, ligne de tableau 28 px.
// Les composants de coquille importent ces classes au lieu de réinventer
// des paddings. Les valeurs restent des classes littérales pour que Tailwind
// les génère.
//
// Aucune famille à chasse fixe : un identifiant se lit, il ne se déguise pas
// en terminal. `tabular-nums` suffit à aligner les chiffres.
// =====================================================================

export const DENSITY = {
  /** Colonne de navigation (desktop). */
  sidebar: 'md:w-[208px]',
  /** Une entrée de navigation : 28 px de haut. */
  navItem: 'h-7 gap-2 rounded px-2 text-[12px] leading-4',
  navIcon: 'size-3.5 shrink-0',
  navSection: 'px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest',
  /** Barre supérieure : 40 px. */
  header: 'h-10',
  /** Zone de contenu : dense, pleine largeur. */
  content: 'px-4 py-3',
  /** Corps de texte de la console. */
  body: 'text-[12.5px] leading-4',
  /** Panneau sobre : un rayon, pas un effet. */
  panel: 'rounded-md border border-border bg-card',
  /** Tableau : en-tête 24 px, ligne 28 px. */
  tableHead: 'h-6 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground',
  tableCell: 'px-2',
  row: 'h-7',
  /** Identifiant technique : chiffres alignés, sans chasse fixe. */
  id: 'text-[11px] tabular-nums text-muted-foreground',
} as const;

// L'ancien `ACCENT` (hex `#EE4B2B` en dur) n'avait aucun importeur : l'accent
// vient des tokens de thème (`highlight`, `ring`, `primary`), qui suivent la
// marque et le mode sombre sans qu'on touche à un composant.
