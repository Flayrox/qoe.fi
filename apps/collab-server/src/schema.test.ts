import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// =====================================================================
// 🗂️ Le schéma de `collab_documents` appartient aux migrations goose
// =====================================================================
// `database.ts` crée la table à l'exécution (`IF NOT EXISTS`) pour le dev,
// mais une table créée uniquement par l'application n'a ni propriétaire, ni
// index, ni politique de sauvegarde : sur une base fraîche, `pnpm db:migrate`
// ne la créait pas et le serveur dépendait du droit CREATE du rôle applicatif.
// Ce test fige le contrat : une migration doit créer la table.
// =====================================================================

const MIGRATIONS_DIR = resolve(__dirname, '../../api/sql/migrations');

describe('collab_documents — propriété du schéma', () => {
  it('est créée par une migration goose', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);

    const owner = files.find((name) => {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
      return /CREATE TABLE IF NOT EXISTS collab_documents/i.test(sql);
    });

    expect(owner, 'aucune migration ne crée collab_documents').toBeTruthy();
  });
});
