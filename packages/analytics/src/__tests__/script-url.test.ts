// =====================================================================
// 🧪 script-url — un build local ne charge jamais un analytics distant
// =====================================================================
// Régression verrouillée : un `.env` de poste pointait
// `http://116.203.158.47:15411` et les pages tenant chargées en e2e appelaient
// l'analytics de l'infra partagée. La règle est désormais dans le code, pas
// seulement dans la config du poste.
// =====================================================================

import { describe, expect, it } from 'vitest';

import {
  FIRST_PARTY_ANALYTICS_PATH,
  hostnameOf,
  isLocalHostname,
  resolveAnalyticsScriptUrl,
} from '../script-url';

const LOCAL_APP = 'http://localhost:3010';
const PROD_APP = 'https://qoe.fi';

describe('resolveAnalyticsScriptUrl', () => {
  it('replie sur le proxy first-party quand la variable est absente', () => {
    expect(resolveAnalyticsScriptUrl(undefined, LOCAL_APP)).toBe(FIRST_PARTY_ANALYTICS_PATH);
    expect(resolveAnalyticsScriptUrl('   ', PROD_APP)).toBe(FIRST_PARTY_ANALYTICS_PATH);
  });

  it('conserve le chemin first-party explicite', () => {
    expect(resolveAnalyticsScriptUrl('/_q/m.js', LOCAL_APP)).toBe('/_q/m.js');
    expect(resolveAnalyticsScriptUrl('/_q/m.js', PROD_APP)).toBe('/_q/m.js');
  });

  it('ignore une URL distante sur un build local (régression infra partagée)', () => {
    expect(resolveAnalyticsScriptUrl('http://116.203.158.47:15411/script.js', LOCAL_APP)).toBe(
      FIRST_PARTY_ANALYTICS_PATH
    );
    expect(resolveAnalyticsScriptUrl('https://umami.qoe.fi/script.js', LOCAL_APP)).toBe(
      FIRST_PARTY_ANALYTICS_PATH
    );
    // Origines locales reconnues : *.localhost, lvh.me, qoe.test.
    for (const app of [
      'http://localhost:15403',
      'http://admin.localhost',
      'http://qoe.test',
      'http://media.lvh.me:3010',
    ]) {
      expect(resolveAnalyticsScriptUrl('http://116.203.158.47:15411/script.js', app)).toBe(
        FIRST_PARTY_ANALYTICS_PATH
      );
    }
  });

  it('accepte un conteneur d’analytics local même sur un build local', () => {
    expect(resolveAnalyticsScriptUrl('http://localhost:15411/script.js', LOCAL_APP)).toBe(
      'http://localhost:15411/script.js'
    );
    expect(resolveAnalyticsScriptUrl('http://127.0.0.1:15411/script.js', LOCAL_APP)).toBe(
      'http://127.0.0.1:15411/script.js'
    );
  });

  it('honore une URL distante sur un build de production', () => {
    expect(resolveAnalyticsScriptUrl('https://umami.qoe.fi/script.js', PROD_APP)).toBe(
      'https://umami.qoe.fi/script.js'
    );
  });

  it('refuse les valeurs non-URL et le protocole-relatif', () => {
    expect(resolveAnalyticsScriptUrl('//evil.example/m.js', PROD_APP)).toBe(
      FIRST_PARTY_ANALYTICS_PATH
    );
    expect(resolveAnalyticsScriptUrl('m.js', PROD_APP)).toBe(FIRST_PARTY_ANALYTICS_PATH);
  });
});

describe('isLocalHostname / hostnameOf', () => {
  it('reconnaît les hôtes de poste local', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '::1',
      '[::1]',
      'admin.localhost',
      'lvh.me',
      'media.lvh.me',
      'qoe.test',
      'studio.qoe.test',
    ]) {
      expect(isLocalHostname(host), host).toBe(true);
    }
  });

  it('rejette les hôtes publics et les valeurs vides', () => {
    for (const host of ['116.203.158.47', 'qoe.fi', 'umami.qoe.fi', '', null, undefined]) {
      expect(isLocalHostname(host as string | null | undefined), String(host)).toBe(false);
    }
  });

  it('extrait l’hôte sans lever sur une valeur invalide', () => {
    expect(hostnameOf('http://116.203.158.47:15411/script.js')).toBe('116.203.158.47');
    expect(hostnameOf('pas une url')).toBeNull();
    expect(hostnameOf(undefined)).toBeNull();
  });
});
