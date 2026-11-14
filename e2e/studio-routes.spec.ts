// =====================================================================
// 🗺️ studio-routes.spec.ts — chaque page de apps/studio est rendue
// =====================================================================
// Projet Playwright : `studio` (playwright.apps.config.ts, baseURL 15404).
// L'éditeur est protégé : anonyme, ses pages doivent rediriger vers le login
// (307/308 + `Location`), jamais servir un écran métier ni planter.
// =====================================================================

import { registerRouteMatrix } from './lib/route-matrix';

registerRouteMatrix('studio');
