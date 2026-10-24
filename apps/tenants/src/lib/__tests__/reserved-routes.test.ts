import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RESERVED_TENANT_ROUTES } from '@qoe/config';

// =====================================================================
// 🛡️ Garde de parité — routes statiques tenant vs slugs réservés
// =====================================================================
// Une catégorie dont le slug égale une route statique est inaccessible :
// la route statique gagne toujours sur le catch-all [categorySlug].
//
// Ce test rend la règle automatique :
//  1. il découvre les routes réellement présentes dans le filesystem Next ;
//  2. il vérifie qu'elles sont toutes réservées dans @qoe/config ;
//  3. il vérifie que la liste Go (validation API) est identique à la liste TS.
// Ajouter une page sans la réserver fait donc échouer la CI.
// =====================================================================

const here = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start: string): string {
  let dir = start;
  while (!fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Racine du monorepo introuvable');
    dir = parent;
  }
  return dir;
}

const repoRoot = findRepoRoot(here);
const tenantRoutesDir = path.join(repoRoot, 'apps/tenants/src/app/tenant/[domain]');

/** Routes servies à la racine de l'app (hors groupe tenant), réservées aussi. */
const APP_ROOT_ROUTES = ['api', 'auth', 'tenant', 'robots.txt', 'sitemap.xml', 'icon.svg'];

/** Premier segment de chaque page.tsx / route.ts sous tenant/[domain]. */
function collectTenantRouteSegments(root: string): Set<string> {
  const segments = new Set<string>();

  const walk = (dir: string, firstSegment?: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const segment = firstSegment ?? (entry.isDirectory() ? entry.name : undefined);

      if (entry.isDirectory()) {
        walk(fullPath, segment);
        continue;
      }
      if (!/^(page|route)\.(tsx|ts|jsx|js)$/.test(entry.name)) continue;
      if (!segment) continue; // page.tsx à la racine du groupe tenant
      if (segment.startsWith('[') || segment.startsWith('_')) continue;
      segments.add(segment);
    }
  };

  walk(root);
  return segments;
}

/** Extrait la denylist Go pour vérifier qu'elle ne dérive pas de la liste TS. */
function readGoReservedRoutes(): Set<string> {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/api/internal/shared/identifier/identifier.go'),
    'utf8'
  );
  const block = source.match(/var reservedTenantRoutes = map\[string\]struct\{\}\{([\s\S]*?)\n\}/);
  if (!block) throw new Error('Bloc reservedTenantRoutes introuvable dans identifier.go');
  return new Set([...block[1].matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]));
}

describe('slugs réservés des routes tenant', () => {
  const discovered = collectTenantRouteSegments(tenantRoutesDir);
  const reserved: string[] = [...RESERVED_TENANT_ROUTES];

  it('réserve chaque route statique réellement présente', () => {
    const missing = [...discovered].filter((slug) => !reserved.includes(slug)).sort();
    expect(missing).toEqual([]);
  });

  it('ne contient ni doublon ni entrée obsolète', () => {
    expect(new Set(reserved).size).toBe(reserved.length);

    const stale = reserved.filter(
      (slug) => !discovered.has(slug) && !APP_ROOT_ROUTES.includes(slug)
    );
    expect(stale).toEqual([]);
  });

  it('reste identique à la denylist Go qui valide les catégories', () => {
    const goReserved = readGoReservedRoutes();
    expect([...goReserved].sort()).toEqual([...reserved].sort());
  });
});
