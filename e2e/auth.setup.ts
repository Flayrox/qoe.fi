// =====================================================================
// 🔑 e2e/auth.setup.ts — état d'authentification du projet `chromium`
// =====================================================================
// Deux issues, jamais d'entre-deux :
//   • la stack locale répond → session GoTrue RÉELLE + ligne `User` en base,
//     cookie écrit dans `playwright/.auth/user.json` ;
//   • elle ne répond pas → état vide. Les specs qui exigent un écran connecté
//     se sautent avec une raison explicite (cf. `e2e/lib/auth.ts`), au lieu
//     d'asserter sur la page de login sans le dire.
// =====================================================================

import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { AUTH_STATE, createBrowserSession, supabaseReachable } from './lib/auth';
import { COOKIE_NAME } from './lib/env';

setup('authenticate', async ({ context }) => {
  fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true });

  if (!(await supabaseReachable())) {
    fs.writeFileSync(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    return;
  }

  const session = await createBrowserSession();

  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: session.cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await context.storageState({ path: AUTH_STATE });
});
