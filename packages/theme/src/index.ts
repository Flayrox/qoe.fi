// ═══════════════════════════════════════════════════════════════════
// 📦 @qoe/theme — Barrel exports
// ═══════════════════════════════════════════════════════════════════
//
// Import depuis n'importe quelle app :
//   import { ThemeProvider, ThemeStyle, THEMES, token } from "@qoe/theme";
//   import "@qoe/theme/styles";   // CSS (dans layout.tsx)

export * from './types';
export * from './registry';
export { ThemeProvider } from './ThemeProvider';
export { ThemeStyle, buildCreatorVars } from './ThemeStyle';
export { token, tokens } from './tokens';
