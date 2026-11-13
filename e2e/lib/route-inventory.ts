// =====================================================================
// 🗺️ e2e/lib/route-inventory.ts — inventaire des pages Next par app
// =====================================================================
// Sert à deux choses :
//   1. la matrice de routes (e2e/routes.spec.ts) visite chaque page ;
//   2. une garde échoue si une page existe sur le disque sans être ni
//      visitée ni explicitement exemptée.
// Sans cette garde, une nouvelle route peut partir en production sans
// qu'aucun test ne l'ait jamais rendue (vécu le 13/11 : /pricing cassée à
// l'hydratation pendant des semaines alors qu'elle répondait 200).
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';

export type AppName = 'core' | 'admin' | 'studio' | 'tenants' | 'hi';

/** Racine des pages Next par app (relatif au dépôt). */
const APP_ROOTS: Record<AppName, string> = {
  core: 'apps/core/src/app',
  admin: 'apps/admin/src/app',
  studio: 'apps/studio/src/app',
  tenants: 'apps/tenants/src/app',
  hi: 'apps/hi/src/app',
};

/** Les groupes de routes `(reader)` n'apparaissent pas dans l'URL. */
const ROUTE_GROUP = /^\(.+\)$/;

/**
 * Pages (`page.tsx`) découvertes sur le disque, sous forme de patterns d'URL
 * (`/settings/[section]`, `/thought/[...slug]`, groupes de routes retirés).
 */
export function discoverPages(app: AppName): string[] {
  const root = path.join(process.cwd(), APP_ROOTS[app]);
  const pages: string[] = [];

  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'vendor') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, ROUTE_GROUP.test(entry.name) ? segments : [...segments, entry.name]);
      } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
        pages.push(`/${segments.join('/')}`);
      }
    }
  };

  walk(root, []);
  return [...new Set(pages)].sort();
}

export function isDynamic(route: string): boolean {
  return route.includes('[');
}

/**
 * Un pattern de page (`/[username]/[tab]`) matche-t-il un chemin concret
 * (`/article/mon-slug`) ? `[x]` = un segment, `[...x]` = le reste du chemin.
 */
export function routeMatches(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (part.startsWith('[...')) return true; // catch-all : avale le reste
    if (part.startsWith('[')) {
      if (pathParts[i] === undefined) return false;
      continue;
    }
    if (part !== pathParts[i]) return false;
  }
  return patternParts.length === pathParts.length;
}

/** Pages découvertes qui ne sont ni visitées ni exemptées. */
export function uncoveredPages(app: AppName, visited: string[], exempted: string[] = []): string[] {
  const covered = [...visited, ...exempted];
  return discoverPages(app).filter(
    (page) => !covered.some((candidate) => routeMatches(page, candidate))
  );
}
