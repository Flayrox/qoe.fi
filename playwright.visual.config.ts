import { defineConfig, devices } from '@playwright/test';

// =====================================================================
// 🖼️ playwright.visual.config.ts — non-régression visuelle des primitives
// =====================================================================
// 📖 Séparé de `playwright.config.ts` à dessein : la suite visuelle ne lit
//    ni base de données, ni API Go, ni compte. Elle compare le rendu du UI
//    Lab (une page qui n'existe qu'en développement) à des captures de
//    référence versionnées.
//
// 🎯 Ce qu'elle protège : une primitive qui change de hauteur, de rayon ou
//    de couleur sans que personne ne l'ait décidé. Un test de rôle ARIA ne
//    voit pas un padding qui glisse ; une capture, si.
// =====================================================================

const PORT = Number(process.env.PLAYWRIGHT_VISUAL_PORT) || 15406;
const BASE_URL = process.env.PLAYWRIGHT_VISUAL_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/visual',
  // Les captures partagent un seul serveur, une seule police, une seule
  // taille de viewport : les paralléliser rend les écarts illisibles.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report/visual' }]]
    : [['list']],
  timeout: 90_000,

  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Un anti-crénelage peut bouger de quelques pixels d'une machine à
      // l'autre ; 0,2 % de la surface est toléré, au-delà c'est un
      // changement de rendu et le test doit échouer.
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },

  // Les captures vivent à côté de la spec, versionnées avec elle.
  // Le segment `{platform}` n'est pas décoratif : l'anti-crénelage et le
  // rendu des polices diffèrent entre macOS et Linux. Sans lui, la même
  // référence échouerait sur l'autre système, et l'équipe prendrait
  // l'habitude de relancer `--update-snapshots` sans regarder.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{testFileName}/{arg}{ext}',

  webServer: {
    // `next dev` sans -p : le flag du script dev (`-p 15404`) écraserait
    // PORT et le readiness check attendrait le mauvais port.
    command: 'pnpm --filter @qoe/studio exec next dev',
    url: `${BASE_URL}/dev/ui-lab`,
    // En local, on réutilise le serveur déjà lancé (celui que l'agent ou le
    // développeur utilise) ; en CI, Playwright en démarre un.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
      SKIP_ENV_VALIDATION: 'true',
    },
  },

  projects: [
    {
      name: 'visual',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
