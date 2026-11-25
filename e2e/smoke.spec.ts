import { test, expect } from '@playwright/test';
import { settleHydration } from './lib/settle';
import { supabaseReachable } from './lib/auth';

const ROUTES = ['/home', '/settings', '/notifications', '/search', '/library'];

test.describe('Feed E2E Scan & Zero-Hydration Error Audit', () => {
  // 🚦 `/home`, `/settings`, `/notifications`, `/search`, `/library` résolvent la
  // session côté serveur (GoTrue). Sans stack Supabase de test/dev, ces routes
  // redirigent vers /login : les asserter donnerait cinq fois le même test de
  // la page de login.
  test.beforeAll(async () => {
    test.skip(
      !(await supabaseReachable()),
      'Stack Supabase de test/dev (Hetzner) injoignable : lancer pnpm dev:vps pour le relais 127.0.0.1:54321.'
    );
  });

  for (const route of ROUTES) {
    test(`route "${route}" should render cleanly without console or hydration errors`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Filter out transient browser font/network fetch errors if server isn't running in CI
          if (
            !text.includes('ERR_CONNECTION_REFUSED') &&
            !text.includes('Failed to load resource')
          ) {
            consoleErrors.push(text);
          }
        }
      });

      page.on('pageerror', (err) => {
        pageErrors.push(err.message);
      });

      // `networkidle` sous 15 s expirait dès que la page compilait (dev) ou
      // qu'un widget sondait : on attend `domcontentloaded` puis l'état
      // d'hydratation observé (réseau au repos + frames React).
      await page.goto(route, { timeout: 45_000, waitUntil: 'domcontentloaded' });
      await settleHydration(page);

      // Assert zero hydration errors
      const hydrationErrors = consoleErrors.filter(
        (err) =>
          err.includes('Hydration failed') ||
          err.includes('Text content does not match') ||
          err.includes('Server/Client mismatch')
      );

      expect(
        hydrationErrors,
        `Hydration errors detected on route ${route}: ${hydrationErrors.join(', ')}`
      ).toEqual([]);
      expect(
        pageErrors,
        `Unhandled page errors detected on route ${route}: ${pageErrors.join(', ')}`
      ).toEqual([]);
    });
  }
});
