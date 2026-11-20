#!/usr/bin/env node
// =====================================================================
// 🧭 Garde CI — chaque `tsconfig` pointe vers une cible qui existe
// =====================================================================
// 📖 Trois dérives trouvées en L19, invisibles au typecheck :
//    - `packages/ui` mappait `@qoe/sdk` vers `../api-client/src/*` — un
//      paquet qui n'existe pas (le SDK vit dans `packages/sdk`). L'alias ne
//      matchait donc jamais et les imports retombaient, en silence, sur
//      `node_modules` : la config mentait sur l'intention.
//    - `packages/theme` déclarait `@qoe/tsconfig` en dépendance mais étendait
//      `../tsconfig/react-library.json` à la main : deux façons de faire le
//      même chose, donc deux endroits à mettre à jour.
//    - `apps/collab-server` utilisait `moduleResolution: "node"` (l'alias
//      historique `node10`), déprécié par TypeScript 6.
//
// 🎯 Le garde échoue si :
//    A. une entrée `paths` désigne un chemin inexistant (wildcards inclus) ;
//    B. un paquet dépend de `@qoe/tsconfig` mais étend un chemin relatif au
//       lieu du preset ;
//    C. un `tsconfig` utilise la résolution legacy `node` / `node10` ;
//    D. un workspace qui déclare un script `typecheck` n'a pas de
//       `tsconfig.json` (le paquet n'est alors jamais vérifié).
// =====================================================================

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const WORKSPACES = ['apps', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo', '.expo']);
const TSCONFIG = /^tsconfig.*\.json$/;

// Dossiers générés : jamais une source, donc jamais dans un `include`.
const GENERATED_DIRS = [
  '.next',
  '.expo',
  'dist',
  'build',
  '.turbo',
  'coverage',
  'out',
  'storybook-static',
];

/** Liste récursive des `tsconfig*.json` d'un workspace (hors dossiers générés). */
function collectConfigs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectConfigs(full, out);
    } else if (TSCONFIG.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Chemin statique d'une cible `paths` (`./src/*` → `./src`). */
function staticPrefix(target) {
  const star = target.indexOf('*');
  return star === -1 ? target : target.slice(0, star).replace(/\/+$/, '') || '.';
}

const errors = [];

/** Règles A et C sur un fichier de config (racine comprise). */
function checkConfig(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const dir = dirname(configPath);
  const label = relative(ROOT, configPath);

  const resolution = config.compilerOptions?.moduleResolution;
  if (resolution === 'node' || resolution === 'node10') {
    errors.push(
      `${label} : \`moduleResolution: "${resolution}"\` est la résolution ` +
        'legacy node10, dépréciée — utiliser `NodeNext` ou `Bundler`'
    );
  }

  // E. le programme typé part des sources, jamais du dossier entier.
  //    `include: ["**/*.ts"]` avale tout ce qui traîne à la racine du
  //    workspace — dont les dossiers générés. Un `exclude` posé dans l'app ne
  //    rattrape rien : TypeScript **remplace** l'`exclude` hérité au lieu de
  //    le fusionner, donc le `.next` du preset disparaît dès qu'une app
  //    déclare le sien. Une copie d'artefact (macOS duplique `routes.d.ts` en
  //    `routes.d 2.ts`, un `.ts` et non un `.d.ts`) entrait alors dans le
  //    programme et cassait `pnpm typecheck` (TS6200/TS2300) — mesuré sur
  //    `apps/{core,studio,hi,tenants}`.
  for (const pattern of Array.isArray(config.include) ? config.include : []) {
    const value = String(pattern);
    const firstSegment = value.split('/')[0];
    if (value.startsWith('**/')) {
      errors.push(
        `${label} : \`include\` balaie tout le workspace (\`${value}\`) — ` +
          'nommer les sources (`src/**`, `*.ts`) pour qu’un artefact généré ne puisse jamais entrer dans le programme'
      );
    }
    if (GENERATED_DIRS.includes(firstSegment)) {
      errors.push(
        `${label} : \`include\` pointe dans un dossier généré (\`${value}\`) — ` +
          'les types générés entrent par la référence explicite du fichier d’environnement (`next-env.d.ts`/`expo-env.d.ts`), pas par un glob'
      );
    }
  }

  for (const [alias, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
    for (const target of Array.isArray(targets) ? targets : [targets]) {
      const prefix = staticPrefix(String(target));
      if (!existsSync(resolve(dir, prefix))) {
        errors.push(
          `${label} : \`paths["${alias}"]\` → \`${target}\` introuvable ` +
            `(${relative(ROOT, resolve(dir, prefix))})`
        );
      }
    }
  }
}

// Le tsconfig de la racine couvre les configs du monorepo (vitest, playwright,
// lingui) : il porte les mêmes règles que ceux des paquets.
if (existsSync(join(ROOT, 'tsconfig.json'))) {
  checkConfig(join(ROOT, 'tsconfig.json'));
}

for (const workspace of WORKSPACES) {
  const workspaceDir = join(ROOT, workspace);

  for (const entry of readdirSync(workspaceDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const packageDir = join(workspaceDir, entry.name);
    const packageJsonPath = join(packageDir, 'package.json');
    if (!existsSync(packageJsonPath)) continue;

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const configPath = join(packageDir, 'tsconfig.json');
    const label = (file) => relative(ROOT, file);

    // D. un paquet typé doit avoir de quoi être typé.
    if (pkg.scripts?.typecheck && !existsSync(configPath)) {
      errors.push(`${relative(ROOT, packageJsonPath)} : déclare \`typecheck\` sans tsconfig.json`);
    }

    if (!existsSync(configPath)) continue;
    const config = JSON.parse(readFileSync(configPath, 'utf8'));

    // B. une dépendance au preset doit passer par le preset.
    const extendsPreset =
      pkg.devDependencies?.['@qoe/tsconfig'] ?? pkg.dependencies?.['@qoe/tsconfig'];
    if (extendsPreset && !String(config.extends ?? '').startsWith('@qoe/tsconfig/')) {
      errors.push(
        `${label(configPath)} : étend \`${config.extends ?? '(rien)'}\` au lieu du preset ` +
          '`@qoe/tsconfig/*` dont il dépend'
      );
    }

    // A + C. cibles `paths` et résolution.
    checkConfig(configPath);
  }
}

if (errors.length > 0) {
  console.error('✖ tsconfig : cibles invalides\n');
  for (const error of errors) console.error(`  • ${error}`);
  console.error(
    `\n${errors.length} problème(s). Un alias qui ne résout pas est un mensonge de config : ` +
      'le typecheck passe par node_modules et personne ne remarque que le chemin est mort. ' +
      'Et un `include` qui balaie le workspace fait entrer les artefacts générés dans le programme : ' +
      'le typecheck tombe pour un fichier que personne n’a écrit.'
  );
  process.exit(1);
}

console.log('✔ tsconfig : tous les alias `paths`, presets et résolutions sont valides.');
