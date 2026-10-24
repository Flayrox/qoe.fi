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
import { join, relative, basename, extname, dirname } from 'node:path';
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

/** Toutes les sources du repo (apps + packages), pour les fuites de moteur. */
export function repoSources() {
  return [...walk(join(ROOT, 'apps')), ...walk(join(ROOT, 'packages'))].map((file) => {
    const code = read(file);
    return { path: relative(ROOT, file), code };
  });
}

/**
 * Combien de fichiers d'app importent réellement ce module partagé.
 * C'est la seule mesure honnête de « est-ce qu'on s'en sert » : elle se
 * calcule depuis le code, elle ne se déclare pas.
 */
export function countUsages(moduleFile) {
  const rel = relative(ROOT, moduleFile);
  const names = exportedNames(moduleFile);

  return appSources.filter((source) =>
    source.imports.some(({ spec, names: imported }) => {
      const target = resolveSpec(spec);
      // Import ciblé (`@qoe/ui/input`, `@qoe/ui/ui/input`) : c'est le fichier
      // réellement chargé qui marque l'usage.
      if (target && target !== BARREL) return target === rel;
      // Import par le barrel (`import { X } from '@qoe/ui'`) : on retombe sur
      // les noms exportés, faute de pouvoir attribuer autrement.
      if (target === BARREL || spec === '@qoe/ui') return imported.some((name) => names.has(name));
      return false;
    })
  ).length;
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
    // Un composant local qui porte le nom d'une primitive est une réinvention.
    localPrimitives: countFilesMatching(
      sources,
      /export (?:default )?function \w*(?:Button|Card|Modal|Select|Input|Menu|Dialog|Popover)\b/
    ),
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
 * Primitives réellement mortes : fichiers de `src/ui/` qu'aucune app ne
 * charge. Doit décroître vague après vague, jamais croître.
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
