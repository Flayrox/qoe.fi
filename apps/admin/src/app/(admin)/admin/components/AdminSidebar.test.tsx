// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// Chemin courant mutable : l'état actif de la navigation dépend de l'écran.
const route = vi.hoisted(() => ({ pathname: '/admin/users' }));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
}));

import { AdminSidebar } from './AdminSidebar';
import { ADMIN_CAPABILITIES, ADMIN_NAV } from '@/lib/admin-console';
import { getAdminSurfaces } from '@qoe/config';

// Liste figée : retirer ou renommer une entrée du manifeste casse ce test.
const EXPECTED_LABELS = [
  'Vue d’ensemble',
  'Ma file',
  'Santé plateforme',
  'Système',
  'Comptes & modération',
  'Signalements',
  'Revue anti-abus',
  'Recours',
  'Incidents',
  'Support',
  'Articles d’aide',
  'Abonnements',
  'Imports d’abonnés',
  'Campagnes staff',
  'Widgets & tendances',
  'Notifications & livraisons',
  'Stockage médias',
  'Rétention & Purge',
  'Demandes d’API',
  'Applications OAuth',
  'Registre features',
  'Réglages',
  'Bac à sable',
  'Feature flags',
  'Frontend & UI',
  'Traducteur & langues',
  'Contenu juridique',
  'Doubles validations',
  'Conformité',
  'Journal d’audit',
  'Accès staff',
  'Matrice des rôles',
  'Décisions d’autorisation',
];

function navLinks() {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-testid^="admin-nav-"]'));
}

describe('AdminSidebar', () => {
  it('rend exactement les entrées du manifeste, dérivées en ADMIN_NAV', () => {
    render(
      <AdminSidebar
        identity={{ roles: ['superadmin'], capabilities: [...ADMIN_CAPABILITIES] }}
        queueCounts={{ '/admin/reports': 7 }}
      />
    );

    const links = navLinks();
    expect(links).toHaveLength(33);
    const labels = links.map((link) => link.textContent?.trim().replace(/\d+$/, ''));
    const hrefs = links.map((link) => link.getAttribute('href'));
    // Toutes les entrées figées sont rendues (retrait/renommage ⇒ échec), et
    // les chemins sont exactement ceux du manifeste partagé.
    expect(labels).toEqual(expect.arrayContaining(EXPECTED_LABELS));
    expect(hrefs).toEqual(
      expect.arrayContaining(getAdminSurfaces().map((surface) => surface.path))
    );
    expect(ADMIN_NAV).toHaveLength(EXPECTED_LABELS.length);
    expect(links[0]?.getAttribute('href')).toBe('/admin');
    const reports = links.find((link) => link.getAttribute('href') === '/admin/reports');
    expect(reports?.textContent).toContain('7');
  });

  it('ne marque active que l’entrée la plus précise du chemin courant', () => {
    // `/admin` est le préfixe de TOUS les écrans : il ne doit pas rester actif
    // sur un écran enfant.
    route.pathname = '/admin/reports';
    render(
      <AdminSidebar identity={{ roles: ['superadmin'], capabilities: [...ADMIN_CAPABILITIES] }} />
    );

    const active = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[aria-current="page"]')
    ).map((link) => link.getAttribute('href'));

    expect(active).toEqual(['/admin/reports']);
  });

  it('ne marque pas active l’entrée parente d’un sous-écran', () => {
    // `/admin/access` et `/admin/access/roles` partagent un préfixe : seul le
    // second est l'écran courant.
    route.pathname = '/admin/access/roles';
    render(
      <AdminSidebar identity={{ roles: ['superadmin'], capabilities: [...ADMIN_CAPABILITIES] }} />
    );

    const active = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[aria-current="page"]')
    ).map((link) => link.getAttribute('href'));

    expect(active).toEqual(['/admin/access/roles']);
  });

  it("n'affiche que les écrans ouverts par les capacités détenues", () => {
    render(
      <AdminSidebar identity={{ roles: ['support'], capabilities: ['admin.support.read'] }} />
    );

    const labels = navLinks().map((link) => link.textContent?.trim());
    expect(labels).toEqual(['Support']);
  });
});
