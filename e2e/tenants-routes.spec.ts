// =====================================================================
// 🗺️ tenants-routes.spec.ts — chaque page de apps/tenants est rendue
// =====================================================================
// Projet Playwright : `tenants` (playwright.apps.config.ts, baseURL 15403).
// Anonyme, une page de publication peut légitimement rediriger (résolution du
// tenant) — ce qui est interdit, c'est un 5xx, une error boundary ou une
// redirection sans `Location`.
// =====================================================================

import { registerRouteMatrix } from './lib/route-matrix';

registerRouteMatrix('tenants');
