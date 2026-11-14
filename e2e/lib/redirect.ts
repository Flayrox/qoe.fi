// =====================================================================
// 🔁 expectRedirect — auth gate E2E résilient
// =====================================================================
// Next dev compile une route à sa PREMIÈRE requête et peut répondre 5xx
// transitoire pendant la compilation (le fameux « server error » de prod).
// On warm-up donc (requête qui suit la redirection) puis on retente avec
// maxRedirects:0 jusqu'à obtenir un vrai 3xx stable.
// =====================================================================

import type { APIRequestContext } from '@playwright/test';

// Budget d'une requête : la première visite d'une route peut compiler plusieurs
// dizaines de secondes sur un runner CI chargé. Sans borne explicite, c'est le
// timeout du test (60 s par défaut) qui tombe, avec un message trompeur
// (« Target page, context or browser has been closed »).
const REQUEST_TIMEOUT = 90_000;

export async function expectRedirect(
  request: APIRequestContext,
  url: string,
  attempts = 12
): Promise<number> {
  let status = 0;
  for (let i = 0; i < attempts; i++) {
    // Warm-up : compile la route (et la page cible de la redirection).
    await request.get(url, { timeout: REQUEST_TIMEOUT }).catch(() => {});
    const res = await request.get(url, { maxRedirects: 0, timeout: REQUEST_TIMEOUT });
    status = res.status();
    if (status >= 300 && status < 400) return status;
    // 5xx transitoire de compilation : on attend que la route soit chaude.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return status;
}
