// =====================================================================
// 🗺️ hi-routes.spec.ts — chaque page de apps/hi est rendue
// =====================================================================
// Projet Playwright : `hi` (playwright.apps.config.ts, baseURL 15401).
// La vitrine est publique : ses pages doivent répondre < 500 sans error
// boundary (et 404 propre sur un document légal inconnu).
// =====================================================================

import { registerRouteMatrix } from './lib/route-matrix';

registerRouteMatrix('hi');
