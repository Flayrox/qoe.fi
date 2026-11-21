// =====================================================================
// 🧪 admin-app-urls — aucune origine écrite à la main dans le layout
// =====================================================================
// Le layout de la console construisait ses redirections avec `:3010`,
// `lvh.me` et `qoe.fi` en dur. Sur la console servie en `localhost:15405`,
// la connexion partait donc vers `lvh.me:3010` — un hôte et un port qui
// n'existent pas — et la sortie « sans accès » vers un autre domaine que
// celui de la session. La résolution doit passer par le Domain Hub, comme
// partout ailleurs (axe 8 : portabilité).
// =====================================================================

import { describe, expect, it } from 'vitest';
import { adminHomeUrl, adminLoginUrl } from '../admin-app-urls';

describe('URLs inter-applications de la console', () => {
  it('renvoie vers la connexion du domaine courant, sans hôte inventé', () => {
    const url = adminLoginUrl('localhost:15405');

    expect(url.startsWith('http://localhost:15402/login?redirect=')).toBe(true);
    expect(url).not.toContain('lvh.me');
    expect(url).not.toContain(':3010');
    expect(decodeURIComponent(url.split('redirect=')[1])).toBe(
      'http://admin.localhost:15405/admin'
    );
  });

  it('reste sur l’environnement qoe.test quand c’est celui qui sert la console', () => {
    const url = adminLoginUrl('admin.qoe.test');

    expect(url.startsWith('http://qoe.test/login?redirect=')).toBe(true);
    expect(decodeURIComponent(url.split('redirect=')[1])).toBe('http://admin.qoe.test/admin');
  });

  it('vise le domaine officiel en production, quel que soit l’hôte d’entrée', () => {
    const url = adminLoginUrl('admin.qoe.fi');

    expect(url.startsWith('https://qoe.fi/login?redirect=')).toBe(true);
    expect(decodeURIComponent(url.split('redirect=')[1])).toBe('https://admin.qoe.fi/admin');
  });

  it('résout la sortie « sans accès » dans le même contexte que l’entrée', () => {
    expect(adminHomeUrl('localhost:15405')).toBe('http://localhost:15402/home');
    expect(adminHomeUrl('admin.qoe.fi')).toBe('https://qoe.fi/home');
  });
});
