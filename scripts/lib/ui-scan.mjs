// =====================================================================
// 🔎 ui-scan.mjs — une seule vérité sur « combien de dette UI »
// =====================================================================
// 📖 Module partagé par `ui-catalog.mjs` (inventaire) et `ui-audit.mjs`
//    (plafonds de dette). Les deux DOIVENT compter la même chose : si
//    l'inventaire dit 735 boutons et l'audit dit 741, plus personne ne
//    croit aux chiffres et le garde-fou est mort.
//
// 🎯 Aucune dépendance : node:fs uniquement, pas de glob, pas d'AST.
//    Les motifs ci-dessous sont volontairement grossiers — ils mesurent
//    une tendance, pas une sémantique. Un faux positif coûte une ligne ;
//    un faux négatif coûte la crédibilité du ratchet.
// =====================================================================

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, basename, extname, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

// ─── Lecture / parcours ──────────────────────────────────────────────
export const read = (file) => readFileSync(file, 'utf8');

/**
 * Dossiers qu'on ne scanne jamais : tests, vendor, builds, dépendances,
 * et le natif mobile (Pods/Xcode : des dizaines de milliers de fichiers,
 * et des liens symboliques cassés qui font échouer le parcours).
 */
export const SKIP_DIR =
  /(__tests__|vendor|node_modules|\.next|dist|\.turbo|Pods|ios|android|\.xcworkspace|\.xcodeproj)/;

/**
 * Fichiers qu'on ne scanne jamais : tests, types, barrels, et le contrat
 * partagé (`contract.ts` n'est pas un composant, il ne doit pas apparaître
 * dans l'inventaire comme une primitive à 0 usage).
 */
export const SKIP_FILE = /(\.test\.|\.spec\.|\.d\.ts$|^index\.tsx?$|^contract\.tsx?$)/;

export function walk(dir, acc = [], { skipLab = false } = {}) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.test(entry)) continue;
    const full = join(dir, entry);
    if (skipLab && relative(ROOT, full).includes('src/app/dev')) continue;
    let st;
    // Un lien symbolique cassé (Pods, monorepo partagé) ne doit pas tuer
    // l'audit : on l'ignore et on continue.
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc, { skipLab });
    else if (['.tsx', '.ts'].includes(extname(entry)) && !SKIP_FILE.test(entry)) acc.push(full);
  }
  return acc;
}

/** Nombre de lignes d'un fichier (métrique de volume, pas de qualité). */
export const linesOf = (file) => read(file).split('\n').length;

// ─── Parsing d'imports (volontairement simple, pas d'AST) ────────────
/** Extrait `{ spec, names }` de chaque import statique d'un fichier. */
export function importsOf(code) {
  const out = [];
  const re = /import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))?\s*from\s*'([^']+)'/gs;
  for (const match of code.matchAll(re)) {
    out.push({
      spec: match[3],
      names: (match[1] ?? '')
        .split(',')
        .map(
          (part) =>
            part
              .trim()
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0]
        )
        .filter(Boolean),
    });
  }
  return out;
}

/** Noms exportés publiquement par un fichier (pour résoudre `import { X } from '@qoe/ui'`). */
export function exportedNames(file) {
  const code = read(file);
  const names = new Set();
  for (const m of code.matchAll(/export (?:function|const|class) (\w+)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export \{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) names.add(name);
    }
  }
  return names;
}

// ─── Correspondance point d'entrée ↔ module ──────────────────────────
// `@qoe/ui/toast` -> `toast`, pour attribuer un usage au bon module.
const packageExports = JSON.parse(read(join(ROOT, 'packages/ui/package.json'))).exports;

const BARREL = 'packages/ui/src/index.ts';

/**
 * Résolution `specifier → fichier réel`.
 *
 * Compter les usages par nom de fichier ne marche pas : `src/ui/button.tsx`
 * (hérité) et `src/primitives/button/button.tsx` (contrat) s'appellent tous
 * les deux `button`. On résout donc chaque import vers le fichier qu'il
 * charge vraiment, y compris pour les exports à joker (`./ui/*`).
 */
const EXACT_SPECS = new Map();
const WILDCARD_SPECS = [];
for (const [key, target] of Object.entries(packageExports)) {
  // Les cibles du `exports` sont relatives au package (`src/...`), pas au
  // dépôt.
  const clean = 'packages/ui/' + String(target).replace(/^\.\//, '');
  if (key.includes('*')) {
    // `key` vaut `./ui/*` : on retire le `.` de tête (comme pour les clés
    // exactes) avant de composer le specifier, sinon le préfixe devient
    // `@qoe/ui./ui/` et ne matche aucun import réel.
    WILDCARD_SPECS.push({
      specPrefix: '@qoe/ui' + key.slice(1).replace('*', ''),
      targetPrefix: clean.replace(/\*$/, ''),
    });
  } else {
    EXACT_SPECS.set('@qoe/ui' + key.slice(1), clean);
  }
}

const CANDIDATE_SUFFIXES = ['.tsx', '.ts', '/index.tsx', '/index.ts'];

/** Chemin du fichier chargé par `spec`, ou `null` si le spec n'est pas à nous. */
export function resolveSpec(spec) {
  const exact = EXACT_SPECS.get(spec);
  if (exact) return exact;

  for (const { specPrefix, targetPrefix } of WILDCARD_SPECS) {
    if (!spec.startsWith(specPrefix)) continue;
    const rest = spec.slice(specPrefix.length);
    for (const suffix of CANDIDATE_SUFFIXES) {
      const candidate = `${targetPrefix}${rest}${suffix}`;
      if (existsSync(join(ROOT, candidate))) return candidate;
    }
  }
  return null;
}

// ─── Sources applicatives (le produit, hors lab) ─────────────────────
export const APP_DIRS = [
  'apps/studio/src',
  'apps/core/src',
  'apps/tenants/src',
  'apps/hi/src',
  'apps/admin/src',
];

/** Sources des apps, avec imports déjà parsés et lab exclu (on ne se mesure pas nous-mêmes). */
export const appSources = APP_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
  .map((file) => {
    const code = read(file);
    return { path: relative(ROOT, file), code, imports: importsOf(code) };
  })
  .filter((source) => !source.path.includes('/src/app/dev/'));

/**
 * Sources des templates partagés (`packages/ui/src/templates/**`).
 *
 * Elles sont livrées aux lecteurs via `@qoe/ui/templates` (apps/tenants,
 * apps/studio) : une primitive importée par un template est donc utilisée en
 * production, même si aucune app ne l'importe directement. Sans ces sources,
 * `CraftSidebarDrawer` était compté « jamais importé » alors qu'il compose
 * `MinimalCraftShell`, monté par `TenantPageShell`.
 */
const templateSources = walk(join(ROOT, 'packages/ui/src/templates')).map((file) => {
  const code = read(file);
  return { path: relative(ROOT, file), code, imports: importsOf(code) };
});

/**
 * Sources internes de `packages/ui` (hors tests et barrels, cf. `SKIP_FILE`).
 *
 * Une primitive composée par le design system lui-même est **utilisée** :
 * `TextParser` est monté par `social/ThoughtBody.tsx`, `hover-card` par
 * `social/ProfileHoverCard.tsx`, `time-picker-utils` par `time-picker-input`.
 * Les ignorer faisait passer des briques centrales pour des fichiers morts.
 */
const internalSources = walk(join(ROOT, 'packages/ui/src')).map((file) => {
  const code = read(file);
  return { path: relative(ROOT, file), code, imports: importsOf(code) };
});

/** Résout un import relatif (`'../../../ui/button'`) vers un fichier du dépôt. */
function resolveRelativeSpec(spec, fromFile) {
  if (!spec.startsWith('.')) return null;
  const base = resolvePath(ROOT, dirname(fromFile), spec);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate)) return relative(ROOT, candidate);
  }
  return null;
}

/** Toutes les sources du repo (apps + packages), pour les fuites de moteur. */
export function repoSources() {
  return [...walk(join(ROOT, 'apps')), ...walk(join(ROOT, 'packages'))].map((file) => {
    const code = read(file);
    return { path: relative(ROOT, file), code };
  });
}

/**
 * Cible d'un fichier qui ne fait que ré-exporter un autre module.
 *
 * `packages/ui/src/ui/input.tsx` n'est que `export { Input, … } from
 * '../primitives/input/input'` : c'est une façade historique, pas une
 * primitive. Compter ses usages à part faisait apparaître `input` comme
 * « jamais importé » dès qu'une app passait par le point d'entrée canonique
 * (`@qoe/ui/input`), alors que le composant était chargé plus que jamais.
 */
function reexportTarget(moduleFile) {
  const code = read(moduleFile);
  if (/export\s+(?:default\s+)?(?:function|const|class|let|var)\s/.test(code)) return null;
  const specs = [
    ...code.matchAll(/export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*'([^']+)'/gs),
  ].map((m) => m[1]);
  if (specs.length !== 1) return null;
  const target = resolveRelativeSpec(specs[0], moduleFile);
  return target && target !== relative(ROOT, moduleFile) ? target : null;
}

/**
 * Combien de fichiers d'app importent réellement ce module partagé.
 * C'est la seule mesure honnête de « est-ce qu'on s'en sert » : elle se
 * calcule depuis le code, elle ne se déclare pas.
 */
export function countUsages(moduleFile) {
  // Une façade de ré-export compte comme sa cible : deux chemins, un module.
  const rel = reexportTarget(moduleFile) ?? relative(ROOT, moduleFile);
  const names = exportedNames(moduleFile);
  const self = relative(ROOT, moduleFile);

  /** Une façade `export … from '<spec>'` charge le module : c'est un usage. */
  const reexports = (code) =>
    [...code.matchAll(/export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*'([^']+)'/gs)].map(
      (match) => match[1]
    );

  const importsIt = (source, spec) => {
    const target = resolveSpec(spec) ?? resolveRelativeSpec(spec, source.path);
    // Import ciblé (`@qoe/ui/input`, `@qoe/ui/ui/input`) : c'est le fichier
    // réellement chargé qui marque l'usage.
    if (target && target !== BARREL) return target === rel;
    return false;
  };

  return [...appSources, ...templateSources, ...internalSources]
    .filter((source) => source.path !== self)
    .filter((source) => {
      if (reexports(source.code).some((spec) => importsIt(source, spec))) return true;
      return source.imports.some(({ spec, names: imported }) => {
        if (importsIt(source, spec)) return true;
        // Import par le barrel (`import { X } from '@qoe/ui'`) : on retombe sur
        // les noms exportés, faute de pouvoir attribuer autrement.
        const target = resolveSpec(spec) ?? resolveRelativeSpec(spec, source.path);
        if (target === BARREL || spec === '@qoe/ui')
          return imported.some((name) => names.has(name));
        return false;
      });
    }).length;
}

// ─── Mesures de dette ────────────────────────────────────────────────
// ⚠️ Piège : un RegExp portant le drapeau `g` est *stateful*. Réutiliser
// `re.test()` sur N fichiers fait avancer `lastIndex` et sous-compte
// silencieusement (mesuré : 125 au lieu de 142 fichiers). On retire donc
// systématiquement le drapeau `g` pour les tests d'existence.
const countFilesMatching = (sources, pattern) => {
  const stateless = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  return sources.filter((s) => stateless.test(s.code)).length;
};
const countAllMatching = (sources, pattern) =>
  sources.reduce((sum, s) => sum + (s.code.match(pattern)?.length ?? 0), 0);

/**
 * Primitives réinventées : un composant local qui porte le nom d'une primitive
 * **sans importer** celle du design system.
 *
 * ⚠️ Le suffixe seul ne suffit pas : `PromptDialog` compose `@qoe/ui/dialog`
 * (même famille, autre contrat) — c'est une composition, pas une réinvention,
 * et la compter comme dette poussait à renommer une bonne abstraction.
 */
const PRIMITIVE_FAMILY = {
  Button: 'button',
  Card: 'card',
  Modal: 'dialog',
  Select: 'select',
  Input: 'input',
  Menu: 'menu',
  Dialog: 'dialog',
  Popover: 'popover',
};

// ⚠️ Nom **exact** : `ComposerModal`, `ThoughtCard` ou `GlobalCommandMenu` sont
// des composants métier, pas des copies de primitive. Le suffixe seul les
// comptait comme dette alors qu'ils importent le contrat (`Dialog`, `CmdK*`).
const LOCAL_PRIMITIVE =
  /export (?:default )?function (Button|Card|Modal|Select|Input|Menu|Dialog|Popover)\s*[(<]/g;

/** Le contrat est-il importé, par n'importe laquelle de ses portes ? */
function importsFamily(code, family, symbol) {
  if (new RegExp(`from '@qoe/ui/(?:ui/)?${family}'`).test(code)) return true;
  // Barrel : `import { Card, Dialog } from '@qoe/ui'` charge la primitive.
  return new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*'@qoe/ui'`, 's').test(
    code
  );
}

function countLocalPrimitives(sources) {
  return sources.filter((source) =>
    [...source.code.matchAll(LOCAL_PRIMITIVE)].some(
      (match) => !importsFamily(source.code, PRIMITIVE_FAMILY[match[1]], match[1])
    )
  ).length;
}

/**
 * Dette « HTML brut » : du markup qui réimplémente une primitive.
 *
 * On mesure les occurrences ET les fichiers : une baisse de fichiers avec
 * une hausse d'occurrences (une page qui empile 30 `<button>`) doit être
 * visible, sinon on optimise la mauvaise métrique.
 */
export function measure(rawSources) {
  const sources = rawSources ?? appSources;
  return {
    rawButtons: countAllMatching(sources, /<button/g),
    rawButtonFiles: countFilesMatching(sources, /<button/g),
    rawInputs: countAllMatching(sources, /<input\b/g),
    rawInputFiles: countFilesMatching(sources, /<input\b/g),
    rawSelects: countAllMatching(sources, /<select\b/g),
    rawSelectFiles: countFilesMatching(sources, /<select\b/g),
    rawTables: countAllMatching(sources, /<table\b/g),
    rawTableFiles: countFilesMatching(sources, /<table\b/g),
    // Un overlay fait main = un piège à focus, un piège à scroll, un piège à Esc.
    handRolledOverlays: countFilesMatching(sources, /fixed inset-0/),
    localPrimitives: countLocalPrimitives(sources),
  };
}

/**
 * Fuites de moteur : ce qui doit rester confiné à `packages/ui`.
 * Mesuré à part de la dette HTML, parce que la correction est différente
 * (on ne migre pas du markup, on retire une dépendance).
 */
export function measureEngine() {
  const sources = repoSources();
  return {
    baseUiImports: countFilesMatching(sources, /from '@base-ui\/react/),
    herouiImportsOutsideUi: sources.filter(
      (s) => !s.path.startsWith('packages/ui/') && /from '@heroui\//.test(s.code)
    ).length,
  };
}

/**
 * Primitives réellement mortes : fichiers de `src/ui/` que **personne** ne
 * charge — ni une app, ni un template, ni le paquet lui-même. Doit décroître
 * vague après vague, jamais croître.
 */
export function unusedPrimitives() {
  const files = walk(join(ROOT, 'packages/ui/src/ui'));
  const unused = files.filter((file) => countUsages(file) === 0);
  return {
    total: files.length,
    unused: unused.length,
    files: unused.map((f) => relative(ROOT, f)),
  };
}

export { countFilesMatching, countAllMatching };
