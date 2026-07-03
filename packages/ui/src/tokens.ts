// =====================================================================
// 🎨 Design Tokens — @qoe/ui
// =====================================================================
// 📖 Re-exporte le helper runtime token() depuis @qoe/theme (source unique).
//    Les composants/charts lisent la valeur résolue du token sémantique,
//    ils suivent ainsi automatiquement le thème actif (light/dark/accent).
//
// ⚠️ Les constantes statiques historiques (COLORS, SPACING...) sont
//    conservées ci-dessous pour rétro-compat mais sont DÉPRÉCIÉES.
//    Préférez `token("--primary")` etc. dans tout nouveau code.
// =====================================================================

export { token, tokens } from "@qoe/theme";

/**
 * @deprecated Palette statique historique. Ne reflete plus le thème actif.
 * Pour une couleur qui suit le thème, utiliser `token("--primary")`.
 * Conservée pour les <option> de color pickers (settings/admin).
 */
export const COLORS = {
  vermillion: {
    50: "#FEF2ED",
    100: "#FBE0D2",
    200: "#F5B79D",
    300: "#EE8A66",
    400: "#E55A2E",
    500: "#EE4B2B", // primary
    600: "#C7331A",
    700: "#9B2412",
    800: "#6E1A0D",
    900: "#451107",
  },
  sepia: {
    50: "#FBF9F6",
    100: "#F4EFE8",
    200: "#E8DFD1",
    300: "#D5C7B0",
    400: "#A8997F",
    500: "#7A6D54",
    600: "#574D3B",
    700: "#3D352A",
    800: "#26221B",
    900: "#13110E",
  },
} as const;

/** @deprecated Utiliser les utilitaires Tailwind (gap-4, p-4...). */
export const SPACING = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
  "2xl": "3rem",
  "3xl": "4rem",
  "4xl": "6rem",
} as const;

/** @deprecated Les familles sont gérées via @theme (voir @qoe/theme/styles). */
export const FONTS = {
  sans: '"Inter", "Geist", system-ui, sans-serif',
  serif: '"Geist", "Playfair Display", Georgia, serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
  display: '"Geist", "Playfair Display", serif',
} as const;

/** @deprecated Utiliser les breakpoints Tailwind. */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/** @deprecated Utiliser les utilitaires Tailwind (duration-150...). */
export const DURATIONS = {
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 600,
} as const;
