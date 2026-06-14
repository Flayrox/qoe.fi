// =====================================================================
// 🎨 Design Tokens — Source unique des couleurs, espacement, typo
// =====================================================================
// 📖 Toutes les constantes de design (couleurs, espacements) sont définies
//    ici et importées par les composants UI.
//
// 🎯 Pourquoi un fichier tokens.ts ?
//    - Permet de les utiliser dans le JS (ex: charts, dynamic styles)
//    - Source unique de vérité (avec tailwind.config.ts)
//    - Type-safe (impossible de se tromper de couleur)
// =====================================================================

/**
 * 🎨 Palette de couleurs qoe.fi
 * Inspiré de l'esthétique vermillon/sépia européenne.
 */
export const COLORS = {
  // Couleurs de marque
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
  // Neutres chauds
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

/**
 * 📏 Échelle d'espacement (en rem, cohérente avec Tailwind).
 */
export const SPACING = {
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "1rem", // 16px
  lg: "1.5rem", // 24px
  xl: "2rem", // 32px
  "2xl": "3rem", // 48px
  "3xl": "4rem", // 64px
  "4xl": "6rem", // 96px
} as const;

/**
 * 🔠 Familles de polices
 */
export const FONTS = {
  sans: '"Inter", "Geist", system-ui, sans-serif',
  serif: '"Geist", "Playfair Display", Georgia, serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
  display: '"Geist", "Playfair Display", serif',
} as const;

/**
 * 🌗 Hauteurs de breakpoints (mobile-first)
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/**
 * ⏱️ Durées d'animation
 */
export const DURATIONS = {
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 600,
} as const;
