// ═══════════════════════════════════════════════════════════════════
// 🎨 @qoe/theme — types.ts
// Types partagés pour le système de thème multi-apps + tenant.
// ═══════════════════════════════════════════════════════════════════

/** Modes de thème gérés par next-themes. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Variantes d'accent brand activables (opt-in). */
export type AccentVariant = 'none' | 'vermillion';

/**
 * Données de branding d'un créateur, lues depuis la DB (User).
 * Utilisées par <ThemeStyle /> pour injecter les overrides tenant en SSR.
 *
 * Tous les champs sont optionnels : un créateur sans branding repose
 * sur les tokens neutres par défaut.
 */
export interface CreatorTheme {
  /** Couleur d'accent HEX (ex: "#EE4B2B"). Override --primary sur le sous-arbre. */
  accentColor?: string | null;
  /** Famille de police active (clé de registre, ex: "sans" | "serif" | "mono"). */
  fontFamily?: string | null;
  /** URL du logo créateur. */
  logoUrl?: string | null;
  /** Texte hero affiché en haut du blog. */
  heroText?: string | null;
  /** URL d'une image de header. */
  headerImageUrl?: string | null;
  /** Texte de footer. */
  footerText?: string | null;
  /** Mode de thème forcé pour le blog tenant ("light" | "dark" | "system"). */
  themeMode?: string | null;
  /** Style de layout ("minimal" | "magazine" | "brutalist"...). */
  layoutStyle?: string | null;
}
