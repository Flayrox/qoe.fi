// =====================================================================
// 🧪 admin-console — parité Go ↔ TS et invariants de navigation
// =====================================================================
// Le vocabulaire des capacités vit côté serveur (`internal/adminauthz`), et
// l'interface en porte un miroir. Un miroir qui dérive est un piège : soit il
// propose un écran que le serveur refusera, soit il en cache un qui existe.
// Ces tests relisent les fichiers Go SUR LE DISQUE et échouent à la moindre
// divergence — la CI casse avant la production, jamais l'inverse.
//
// Ils verrouillent aussi les invariants de navigation : aucune entrée ne cite
// une capacité inconnue, aucun doublon d'URL, et `navItemForPath` choisit
// toujours l'entrée la plus spécifique.
// =====================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
  ADMIN_CAPABILITIES,
  ADMIN_CAPABILITY_DOMAINS,
  ADMIN_DOMAINS,
  ADMIN_NAV,
  visibleNav,
  navByDomain,
  navItemForPath,
  navItemCapabilities,
  isAdminCapability,
  normalizeCapabilities,
  capabilityDomain,
  capabilitiesOfDomain,
  type AdminCapability,
} from './admin-console';

const GO_DIR = fileURLToPath(new URL('../../../../apps/api/internal/adminauthz/', import.meta.url));

function readGo(file: string): string {
  return readFileSync(`${GO_DIR}${file}`, 'utf8');
}

/** Bloc de code Go délimité par une tête et la première accolade fermante. */
function goBlock(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`bloc Go introuvable : ${header}`);
  const end = source.indexOf('\n}', start);
  if (end < 0) throw new Error(`bloc Go non fermé : ${header}`);
  return source.slice(start, end);
}

/** Les constantes `Xxx Capability = "admin.…"` de capability.go. */
function goCapabilityConstants(): { identifier: string; value: string }[] {
  const source = readGo('capability.go');
  const out: { identifier: string; value: string }[] = [];
  const re = /(\w+)\s+Capability\s*=\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) out.push({ identifier: match[1], value: match[2] });
  return out;
}

/** Domaine Go déclaré pour chaque capacité (map `domains`). */
function goCapabilityDomains(): Map<string, string> {
  const constants = new Map(goCapabilityConstants().map((c) => [c.identifier, c.value]));
  const block = goBlock(readGo('capability.go'), 'domains = map[Capability]string{');
  const out = new Map<string, string>();
  const re = /(\w+)\s*:\s*Domain(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) {
    const capability = constants.get(match[1]);
    if (!capability) throw new Error(`domaine déclaré pour une constante inconnue : ${match[1]}`);
    out.set(capability, match[2].toLowerCase());
  }
  return out;
}

describe('parité Go ↔ TS du vocabulaire', () => {
  it('liste exactement les mêmes capacités, dans le même ordre', () => {
    const go = goCapabilityConstants().map((c) => c.value);
    expect([...ADMIN_CAPABILITIES]).toEqual(go);
  });

  it('range chaque capacité dans le même domaine que le Go', () => {
    const domains = goCapabilityDomains();
    expect(domains.size).toBe(ADMIN_CAPABILITIES.length);
    for (const capability of ADMIN_CAPABILITIES) {
      expect(ADMIN_CAPABILITY_DOMAINS[capability]).toBe(domains.get(capability));
    }
  });

  it('ne connaît que des domaines déclarés côté Go', () => {
    const goDomains = new Set(goCapabilityDomains().values());
    expect(new Set(ADMIN_DOMAINS)).toEqual(goDomains);
  });
});

describe('navigation', () => {
  it('ne cite jamais une capacité inconnue du vocabulaire', () => {
    for (const item of ADMIN_NAV) {
      expect(isAdminCapability(item.capability)).toBe(true);
      // Les capacités secondaires peuvent relever d'un autre domaine : un
      // écran d'accès (plateforme) lit aussi le journal d'audit (pilotage).
      for (const extra of navItemCapabilities(item)) {
        expect(isAdminCapability(extra)).toBe(true);
        expect(capabilityDomain(extra)).toBe(ADMIN_CAPABILITY_DOMAINS[extra]);
      }
    }
  });

  it('ne contient aucun doublon d’URL', () => {
    const hrefs = ADMIN_NAV.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('ne présente que les écrans dont la capacité principale est détenue', () => {
    const analyst: AdminCapability[] = ['admin.self.read', 'admin.users.read', 'admin.audit.read'];
    const visible = visibleNav(analyst);
    // L'analyste lit les comptes, l'audit ET les décisions d'autorisation :
    // lire un refus relève de la capacité d'audit, pas du voisinage de l'URL.
    expect(visible.map((item) => item.href)).toEqual([
      '/admin/users',
      '/admin/audit',
      '/admin/access/decisions',
    ]);
    expect(visible.every((item) => analyst.includes(item.capability))).toBe(true);
  });

  it('regroupe par domaine sans perdre d’entrée visible', () => {
    const all = visibleNav(ADMIN_CAPABILITIES);
    const sections = navByDomain(ADMIN_CAPABILITIES);
    const flat = sections.flatMap((section) => section.items.map((item) => item.href));
    expect(flat.sort()).toEqual(all.map((item) => item.href).sort());
    expect(sections.map((section) => section.domain)).toEqual(
      ADMIN_DOMAINS.filter((domain) =>
        all.some((item) => ADMIN_CAPABILITY_DOMAINS[item.capability] === domain)
      )
    );
  });

  it('choisit l’entrée la plus spécifique pour un chemin', () => {
    expect(navItemForPath('/admin/access/decisions')?.href).toBe('/admin/access/decisions');
    expect(navItemForPath('/admin/access/roles')?.href).toBe('/admin/access/roles');
    expect(navItemForPath('/admin/access')?.href).toBe('/admin/access');
    expect(navItemForPath('/admin/users/1234')?.href).toBe('/admin/users');
    expect(navItemForPath('/admin/support/articles')?.href).toBe('/admin/support/articles');
    expect(navItemForPath('/inconnu')).toBeNull();
  });
});

describe('normalisation des capacités reçues de l’API', () => {
  it('écarte les capacités inconnues et les doublons', () => {
    expect(
      normalizeCapabilities(['admin.audit.read', 'admin.inconnue', 'admin.audit.read', ''])
    ).toEqual(['admin.audit.read']);
  });

  it('rend toujours un tableau (jamais null)', () => {
    expect(normalizeCapabilities(null)).toEqual([]);
    expect(normalizeCapabilities(undefined)).toEqual([]);
  });

  it('décrit les capacités d’un domaine sans en oublier', () => {
    const total = ADMIN_DOMAINS.reduce(
      (sum, domain) => sum + capabilitiesOfDomain(domain).length,
      0
    );
    expect(total).toBe(ADMIN_CAPABILITIES.length);
  });
});
