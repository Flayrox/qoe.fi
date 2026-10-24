#!/usr/bin/env node
// =====================================================================
// 🚧 ui-audit.mjs — le ratchet de la dette UI
// =====================================================================
// 📖 Compare la dette mesurable à des plafonds versionnés (`ui-budget.json`)
//    et ÉCHOUE si un seul compteur augmente.
//
// 🎯 Pourquoi un ratchet et pas un simple rapport :
//    un rapport, personne ne le lit ; un plafond qui casse la CI, tout le
//    monde le voit. On n'oblige personne à migrer, on interdit seulement
//    d'empirer — le compteur ne peut que descendre.
//
// ⚠️ Règle des plafonds : ils ne montent JAMAIS sans `--allow-increase`.
//    Sinon la première PR pressée « répare » la CI en relevant le chiffre,
//    et le garde-fou devient décoratif.
//
// 🔧 Usage :
//    node scripts/ui-audit.mjs                  # vérifie (CI)
//    node scripts/ui-audit.mjs --json           # sortie machine
//    node scripts/ui-audit.mjs --update         # fige les baisses
//    node scripts/ui-audit.mjs --allow-increase # (exceptionnel, assumé)
//    pnpm ui:audit
// =====================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, measure, measureEngine, unusedPrimitives } from './lib/ui-scan.mjs';

const BUDGET_PATH = join(ROOT, 'ui-budget.json');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const update = args.has('--update');
const allowIncrease = args.has('--allow-increase');

// ─── Mesures ─────────────────────────────────────────────────────────
const debt = measure();
const engine = measureEngine();
const primitives = unusedPrimitives();

/**
 * Métadonnées par métrique : libellé lisible + la correction à appliquer
 * quand elle régresse. Un garde-fou qui dit seulement « non » est inutile.
 */
const METRICS = {
  rawButtons: { label: '<button> natifs (occurrences)', fix: 'utiliser @qoe/ui/button' },
  rawButtonFiles: { label: 'fichiers avec <button>', fix: 'utiliser @qoe/ui/button' },
  rawInputs: { label: '<input> natifs (occurrences)', fix: 'utiliser @qoe/ui/input' },
  rawInputFiles: { label: 'fichiers avec <input>', fix: 'utiliser @qoe/ui/input' },
  rawSelects: { label: '<select> natifs (occurrences)', fix: 'utiliser @qoe/ui/select' },
  rawSelectFiles: { label: 'fichiers avec <select>', fix: 'utiliser @qoe/ui/select' },
  rawTables: { label: '<table> natifs (occurrences)', fix: 'utiliser @qoe/ui/table' },
  rawTableFiles: { label: 'fichiers avec <table>', fix: 'utiliser @qoe/ui/table' },
  handRolledOverlays: {
    label: 'overlays faits main',
    fix: 'utiliser @qoe/ui/dialog ou @qoe/ui/sheet (sinon : piège à focus, à scroll et à Échap)',
  },
  localPrimitives: {
    label: 'primitives réinventées localement',
    fix: 'importer la primitive partagée au lieu de la réécrire',
  },
  unusedPrimitives: {
    label: 'primitives jamais importées',
    fix: 'soit on migre ses usages, soit on la supprime — jamais la laisser pourrir',
  },
  baseUiImports: {
    label: 'fichiers important Base UI',
    fix: 'le moteur est react-aria : Base UI ne doit que disparaître',
  },
  herouiImportsOutsideUi: {
    label: 'imports HeroUI hors packages/ui',
    fix: 'les apps passent par @qoe/ui/*, jamais par le vendor',
  },
};

const current = {
  ...debt,
  unusedPrimitives: primitives.unused,
  ...engine,
};

// ─── Lecture / écriture du budget ────────────────────────────────────
function loadBudget() {
  if (!existsSync(BUDGET_PATH)) return null;
  return JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
}

const budget = loadBudget();
const limits = budget?.limits ?? {};

const regressions = [];
const decreases = [];
for (const [key, value] of Object.entries(current)) {
  const limit = limits[key];
  if (limit === undefined) {
    regressions.push({ key, value, limit: null });
  } else if (value > limit) {
    regressions.push({ key, value, limit });
  } else if (value < limit) {
    decreases.push({ key, value, limit });
  }
}

// ─── Mise à jour du budget ───────────────────────────────────────────
if (update) {
  const increases = regressions.filter((r) => r.limit !== null);
  if (increases.length > 0 && !allowIncrease) {
    console.error('✖ Refus de relever un plafond sans --allow-increase.\n');
    for (const r of increases) {
      console.error(
        `  ${METRICS[r.key]?.label ?? r.key}: ${r.value} > ${r.limit} — ${METRICS[r.key]?.fix ?? ''}`
      );
    }
    console.error('\n  Réduis la dette, ou assume explicitement : --update --allow-increase.');
    process.exit(1);
  }

  const ordered = Object.fromEntries(
    Object.keys(METRICS)
      .filter((key) => key in current)
      .map((key) => [key, current[key]])
  );

  writeFileSync(
    BUDGET_PATH,
    JSON.stringify(
      {
        $comment:
          'Plafonds de dette UI. Ne peuvent que descendre : `pnpm ui:audit --update` fige les baisses, une hausse exige --allow-increase.',
        limits: ordered,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ) + '\n'
  );
  console.log(`✔ ui-budget.json figé — ${Object.keys(ordered).length} métriques`);
  for (const d of decreases)
    console.log(`  ↓ ${METRICS[d.key]?.label ?? d.key}: ${d.limit} → ${d.value}`);
  process.exit(0);
}

// ─── Sortie machine ──────────────────────────────────────────────────
if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: regressions.length === 0,
        current,
        limits,
        decreases,
        regressions: regressions.map((r) => ({
          metric: r.key,
          label: METRICS[r.key]?.label ?? r.key,
          value: r.value,
          limit: r.limit,
        })),
      },
      null,
      2
    )
  );
  process.exit(regressions.length === 0 ? 0 : 1);
}

// ─── Sortie humaine ──────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

if (!budget) {
  console.log('⚠️  ui-budget.json absent — fige les plafonds actuels avec --update.');
  for (const [key, value] of Object.entries(current)) {
    console.log(`   ${pad(METRICS[key]?.label ?? key, 40)} ${padL(value, 6)}`);
  }
  process.exit(0);
}

console.log('\n🚧 Dette UI — plafonds versionnés\n');
console.log(
  `   ${pad('métrique', 40)}${padL('actuel', 8)}${padL('plafond', 8)}${padL('marge', 8)}`
);
console.log(`   ${'-'.repeat(64)}`);
for (const [key, value] of Object.entries(current)) {
  const limit = limits[key];
  const margin = limit === undefined ? '?' : limit - value;
  const flag = limit !== undefined && value > limit ? '  ✖' : value < (limit ?? value) ? '  ↓' : '';
  console.log(
    `   ${pad(METRICS[key]?.label ?? key, 40)}${padL(value, 8)}${padL(limit ?? '—', 8)}${padL(margin, 8)}${flag}`
  );
}

if (decreases.length > 0) {
  console.log(
    `\n   ↓ ${decreases.length} métrique(s) en baisse — fige-les avec : pnpm ui:audit --update`
  );
}

if (regressions.length === 0) {
  console.log('\n✔ Aucun dépassement.\n');
  process.exit(0);
}

console.error('\n✖ DETTE UI EN HAUSSE\n');
for (const r of regressions) {
  const meta = METRICS[r.key] ?? { label: r.key, fix: '' };
  const limit = r.limit === null ? 'absent du budget' : r.limit;
  console.error(`   ${meta.label}: ${r.value} (plafond ${limit})`);
  if (meta.fix) console.error(`     → ${meta.fix}`);
}
console.error('\n   Le compteur ne peut que descendre. Voir packages/ui ou le UI Lab.\n');
process.exit(1);
