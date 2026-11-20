#!/usr/bin/env node
// =====================================================================
// 🔐 scripts/e2e-studio-auth.mjs — la preuve réseau du studio authentifié
// =====================================================================
// Une seule commande (`pnpm e2e:studio-auth`) monte l'infrastructure
// jetable requise par `e2e/studio-auth-journey.spec.ts`, lance le parcours
// réel (login GoTrue, éditeur, publication, garde réseau) et démonte tout.
//
// Pourquoi ce script existe : le parcours était derrière `test.skip(
// !RUN_FULL_STACK)` — dans un run ordinaire il se sautait sans bruit, donc
// une fuite vers l'infra partagée serait passée verte. Ici, l'infra manquante
// produit un échec explicite (fichier:ligne + commande/variable manquante),
// jamais un `skipped`. Playwright ignore ce spec hors de ce chemin
// (`playwright.apps.config.ts`, `testIgnore`), pour que les projets e2e par
// défaut restent verts sans infra complète.
// =====================================================================

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';

/** Ports jetables : hors des plages utilisées par le poste et la CI. */
const DB_PORT = 55439;
const REDIS_PORT = 6385;
const AUTH_PORT = 54321;

const DB_CONTAINER = 'qoefi-m-db';
const REDIS_CONTAINER = 'qoefi-m-redis';
const DB_URL = `postgresql://qoe:qoe@127.0.0.1:${DB_PORT}/qoe`;

/**
 * Origine canonique du core : sert AUSSI au build (`NEXT_PUBLIC_APP_URL`).
 *
 * ⚠️ Lu au runtime **et** inliné au build : sans elle dans l'environnement de
 * build, `getCookieDomain()` (`packages/supabase/src/cookie-config.ts`) ne
 * pose qu'un cookie hôte-only sur `lvh.me`, que `studio.lvh.me` ne reçoit pas
 * — le studio renvoie alors vers `/login?redirect=…` en boucle.
 */
const APP_ORIGIN = 'http://lvh.me:15402';

/**
 * Échoue franchement, en citant la ligne du présent script.
 *
 * ⚠️ On **lève** au lieu d'appeler `process.exit` : un `exit` à l'intérieur du
 * `try` court-circuite le `finally` et laissait les conteneurs jetables en
 * vie (ports 55439/6385 occupés au run suivant).
 */
class FatalError extends Error {
  constructor(line, message) {
    super(`\n✖ ${message}\n  → scripts/e2e-studio-auth.mjs:${line}\n`);
    this.name = 'FatalError';
  }
}

function fail(line, message) {
  throw new FatalError(line, message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    fail(
      50,
      `commande introuvable : « ${command} » (${result.error.message}). ` +
        `Installe-la puis relance \`pnpm e2e:studio-auth\`.`
    );
  }
  return result.status ?? 1;
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Le CLI Supabase : local (`pnpm exec`), global, sinon npx épinglé. */
function resolveSupabaseCli() {
  const candidates = [
    ['pnpm', ['exec', 'supabase', '--version']],
    ['supabase', ['--version']],
    ['npx', ['--yes', 'supabase@3', '--version']],
  ];
  for (const [command, args] of candidates) {
    const probe = capture(command, args);
    if (probe.status === 0) {
      return (cliArgs) => [command, [...args.slice(0, -1), ...cliArgs]];
    }
  }
  fail(
    78,
    'CLI Supabase introuvable (`supabase --version`, `pnpm exec supabase`, `npx supabase@3`). ' +
      'Installe-le : `brew install supabase/tap/supabase` ou ajoute `supabase` en dépendance.'
  );
  return null;
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function main() {
  // 1. Préflight : tout ce qui manque doit se lire ici, avec sa ligne.
  const docker = capture('docker', ['info']);
  if (docker.status !== 0) {
    fail(
      103,
      'Docker est requis (Postgres/Redis/GoTrue jetables) et `docker info` échoue : ' +
        `${(docker.stderr || docker.stdout).trim().split('\n').slice(-1)[0] ?? 'raison inconnue'}. ` +
        'Démarre le daemon puis relance `pnpm e2e:studio-auth`.'
    );
  }
  for (const port of [DB_PORT, REDIS_PORT, AUTH_PORT, 15402, 15404]) {
    if (!(await portIsFree(port))) {
      fail(
        110,
        `port ${port} déjà occupé : libère-le (le parcours monte sa propre pile jetable) ` +
          'puis relance `pnpm e2e:studio-auth`.'
      );
    }
  }
  const supabase = resolveSupabaseCli();
  const go = capture('go', ['version']);
  if (go.status !== 0) {
    fail(
      118,
      'Go est requis pour `apps/api/cmd/migrate` et `apps/api/cmd/seed` (migrations + seed). ' +
        'Installe Go >= 1.22 puis relance `pnpm e2e:studio-auth`.'
    );
  }

  let started = false;
  try {
    // 2. Pile jetable.
    console.log(`▶ Postgres ${DB_CONTAINER} sur 127.0.0.1:${DB_PORT}`);
    if (
      run('docker', [
        'run',
        '-d',
        '--name',
        DB_CONTAINER,
        '-e',
        'POSTGRES_USER=qoe',
        '-e',
        'POSTGRES_PASSWORD=qoe',
        '-e',
        'POSTGRES_DB=qoe',
        '-p',
        `127.0.0.1:${DB_PORT}:5432`,
        'pgvector/pgvector:pg16',
      ]) !== 0
    ) {
      fail(140, `échec du démarrage de ${DB_CONTAINER} (docker run).`);
    }
    console.log(`▶ Redis ${REDIS_CONTAINER} sur 127.0.0.1:${REDIS_PORT}`);
    if (
      run('docker', [
        'run',
        '-d',
        '--name',
        REDIS_CONTAINER,
        '-p',
        `127.0.0.1:${REDIS_PORT}:6379`,
        'redis:7-alpine',
      ]) !== 0
    ) {
      fail(155, `échec du démarrage de ${REDIS_CONTAINER} (docker run).`);
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (
        capture('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', 'qoe', '-d', 'qoe']).status ===
        0
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(`▶ GoTrue local (supabase start) sur 127.0.0.1:${AUTH_PORT}`);
    const [supabaseBin, supabaseArgs] = supabase(['start']);
    if (run(supabaseBin, supabaseArgs) !== 0) {
      fail(166, '`supabase start` a échoué (GoTrue local requis pour le login réel).');
    }
    started = true;

    // 3. Migrations + seed sur la base jetable.
    console.log('▶ Migrations goose + seed');
    if (
      run('go', ['run', './cmd/migrate', '-dir', 'sql/migrations', 'up'], {
        cwd: 'apps/api',
        env: { ...process.env, DATABASE_URL: DB_URL, API_DATABASE_URL: DB_URL },
      }) !== 0
    ) {
      fail(177, '`go run ./cmd/migrate up` a échoué sur la base jetable.');
    }
    if (
      run('go', ['run', './cmd/seed'], {
        cwd: 'apps/api',
        env: { ...process.env, DATABASE_URL: DB_URL, API_DATABASE_URL: DB_URL },
      }) !== 0
    ) {
      fail(185, '`go run ./cmd/seed` a échoué sur la base jetable.');
    }

    // 4. Clés réelles de l'instance locale (jamais codées en dur).
    const status = capture(...supabase(['status', '-o', 'env']));
    const envOf = (key) =>
      status.stdout.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, 'm'))?.[1] ?? '';
    const anonKey = envOf('ANON_KEY');
    const serviceKey = envOf('SERVICE_ROLE_KEY');
    const jwtSecret = envOf('JWT_SECRET');
    if (!anonKey || !serviceKey || !jwtSecret) {
      fail(
        198,
        'clés GoTrue absentes de `supabase status -o env` (ANON_KEY/SERVICE_ROLE_KEY/JWT_SECRET).'
      );
    }

    // 5. Le parcours. `NEXT_PUBLIC_SUPABASE_URL` reste surchargeable : c'est ce
    //    qui permet de prouver qu'un `.env` pointé sur le VPS ne fuit pas.
    const externalSupabase =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? `http://127.0.0.1:${AUTH_PORT}`;

    // 5a. Builds de PRODUCTION, comme le job `e2e-apps` (même commande
    //     `pnpm intl:compile && pnpm --filter @qoe/<app> build`) : la preuve
    //     réseau doit porter sur les artefacts réellement servis, pas sur un
    //     `next dev` compilé à la demande. `PLAYWRIGHT_APPS_PROD=1` reste
    //     l'unique bascule de régime (`playwright.apps.config.ts`), et
    //     `admin` n'a pas de `next dev` de secours : il est construit ici comme
    //     les deux autres apps servies par cette config (matrice CI e2e-apps).
    console.log('▶ Builds de production (studio + admin + core)');
    const buildEnv = {
      ...process.env,
      SKIP_ENV_VALIDATION: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
      QOE_API_URL: 'http://localhost:8091',
      NEXT_PUBLIC_APP_URL: APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: externalSupabase,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    };
    if (run('pnpm', ['intl:compile'], { env: buildEnv }) !== 0) {
      fail(215, '`pnpm intl:compile` a échoué (catalogue de traduction requis par le build).');
    }
    for (const app of ['@qoe/studio', '@qoe/admin', '@qoe/core']) {
      if (run('pnpm', ['--filter', app, 'build'], { env: buildEnv }) !== 0) {
        fail(220, `le build de production de ${app} a échoué.`);
      }
    }

    console.log(`▶ Parcours studio authentifié (Supabase déclaré : ${externalSupabase})`);
    const playwrightStatus = run(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'playwright.apps.config.ts',
        '--project=studio',
        '--grep',
        'parcours réel',
        '--reporter=list',
      ],
      {
        env: {
          ...process.env,
          RUN_FULL_STACK: '1',
          // Même bascule que le job `e2e-apps` : `next start` sur les builds
          // qui viennent d'être produits.
          PLAYWRIGHT_APPS_PROD: '1',
          PLAYWRIGHT_GO_API_PORT: '8091',
          QOE_API_URL: 'http://localhost:8091',
          DATABASE_URL: DB_URL,
          API_DATABASE_URL: DB_URL,
          REDIS_URL: `redis://127.0.0.1:${REDIS_PORT}`,
          NEXT_PUBLIC_APP_URL: APP_ORIGIN,
          NEXT_PUBLIC_SUPABASE_URL: externalSupabase,
          SUPABASE_AUTH_URL: externalSupabase,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
          SUPABASE_SERVICE_ROLE_KEY: serviceKey,
          SUPABASE_SECRET_KEY: serviceKey,
          SUPABASE_JWT_SECRET: jwtSecret,
        },
      }
    );
    if (playwrightStatus !== 0) {
      fail(245, 'le parcours studio authentifié a échoué (voir la sortie Playwright ci-dessus).');
    }
  } finally {
    // 6. Démontage systématique, même en cas d'échec — et bavard s'il échoue.
    const remove = capture('docker', ['rm', '-f', DB_CONTAINER, REDIS_CONTAINER]);
    if (remove.status !== 0) {
      console.error(`⚠ démontage incomplet (docker rm) : ${remove.stderr.trim()}`);
      console.error(`  → scripts/e2e-studio-auth.mjs:270`);
    }
    if (started) {
      const [supabaseBin, supabaseArgs] = supabase(['stop', '--no-backup']);
      const stop = capture(supabaseBin, supabaseArgs);
      if (stop.status !== 0) {
        console.error(`⚠ démontage incomplet (supabase stop) : ${stop.stderr.trim()}`);
        console.error(`  → scripts/e2e-studio-auth.mjs:278`);
      }
    }
  }
  console.log('\n✅ Parcours studio authentifié vert, pile jetable démontée.');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof FatalError ? error.message : error);
  process.exitCode = 1;
}
