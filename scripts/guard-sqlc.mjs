#!/usr/bin/env node
// =====================================================================
// 🛡️ guard:sqlc — les fichiers générés correspondent-ils au schéma ?
// =====================================================================
// 📖 `apps/api/internal/database` (38 f. · ~22 000 l.) est produit par sqlc
//    depuis `sql/schema/schema.sql` + `sql/queries/**`. Rien ne vérifiait cette
//    correspondance : une requête ajoutée à `.sql` sans régénération (ou une
//    colonne renommée par une migration sans `sqlc generate`) compile très bien
//    — le code Go périmé reste syntaxiquement valide — et n'échoue qu'à
//    l'exécution, en production, sur un `Scan` qui ne correspond plus.
//
// 🎯 Ce garde régénère dans un répertoire temporaire et compare octet par octet :
//      pnpm guard:sqlc
//    Sort en 1 si un fichier généré manque, s'il a divergé, ou si le dépôt
//    contient un fichier que sqlc ne produit plus.
//
// 📌 Version épinglée (SQLC_VERSION) : un générateur plus récent reformate la
//    sortie et ferait échouer le garde sans qu'aucune requête n'ait changé.
//    Monter de version = régénérer dans le même commit. Installer :
//      go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1
//    (`SQLC_BIN=/chemin/sqlc pnpm guard:sqlc` pour un binaire hors PATH.)
// =====================================================================

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SQLC_VERSION = 'v1.31.1';
const API_DIR = fileURLToPath(new URL('../apps/api', import.meta.url));
const GENERATED_DIR = 'internal/database';

function fail(message) {
  console.error(`\n❌ guard:sqlc — ${message}\n`);
  process.exit(1);
}

/** Résout le binaire sqlc (env, puis PATH) et vérifie sa version épinglée. */
function resolveSqlc() {
  const bin = process.env.SQLC_BIN || 'sqlc';
  const probe = spawnSync(bin, ['version'], { encoding: 'utf8' });
  if (probe.error) {
    fail(
      `binaire sqlc introuvable (${bin}). Installer la version épinglée :\n` +
        `   go install github.com/sqlc-dev/sqlc/cmd/sqlc@${SQLC_VERSION}`
    );
  }
  const version = (probe.stdout || '').trim();
  if (version !== SQLC_VERSION) {
    fail(
      `sqlc ${version || 'inconnu'} installé, ${SQLC_VERSION} attendu — ` +
        `un autre générateur produit une sortie différente.\n` +
        `   go install github.com/sqlc-dev/sqlc/cmd/sqlc@${SQLC_VERSION}`
    );
  }
  return bin;
}

const sqlc = resolveSqlc();
const work = mkdtempSync(join(tmpdir(), 'qoe-sqlc-'));

try {
  // Le générateur lit des chemins relatifs à `sqlc.yaml` : on copie la config,
  // le schéma, les requêtes et un dossier de sortie vide.
  cpSync(join(API_DIR, 'sqlc.yaml'), join(work, 'sqlc.yaml'));
  cpSync(join(API_DIR, 'sql'), join(work, 'sql'), { recursive: true });
  mkdirSync(join(work, 'internal'), { recursive: true });

  try {
    execFileSync(sqlc, ['generate'], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`sqlc generate a échoué :\n${error.stderr?.toString?.().trim() ?? error.message}`);
  }

  const generated = readdirSync(join(work, GENERATED_DIR)).filter((f) => f.endsWith('.go'));
  const committed = readdirSync(join(API_DIR, GENERATED_DIR)).filter((f) => f.endsWith('.go'));
  if (generated.length === 0) fail('sqlc n’a produit aucun fichier — configuration illisible ?');

  const problems = [];
  for (const file of generated) {
    const expected = readFileSync(join(work, GENERATED_DIR, file));
    let actual;
    try {
      actual = readFileSync(join(API_DIR, GENERATED_DIR, file));
    } catch {
      problems.push(`${file} : généré mais absent du dépôt`);
      continue;
    }
    if (!expected.equals(actual)) {
      problems.push(`${file} : diverge du schéma et des requêtes actuels`);
    }
  }
  for (const file of committed) {
    if (!generated.includes(file)) {
      problems.push(`${file} : présent dans le dépôt mais sqlc ne le produit plus`);
    }
  }

  if (problems.length > 0) {
    console.error('\n❌ guard:sqlc — code généré périmé :');
    for (const problem of problems) console.error(`   • ${problem}`);
    console.error(
      `\n   → régénérer et committer dans le même changement :\n` +
        `     (cd apps/api && sqlc generate)\n` +
        `   (${SQLC_VERSION})\n`
    );
    process.exit(1);
  }

  console.log(
    `✅ guard:sqlc — ${generated.length} fichiers de ${relative(process.cwd(), join(API_DIR, GENERATED_DIR))} ` +
      `à jour (sqlc ${SQLC_VERSION}).`
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
