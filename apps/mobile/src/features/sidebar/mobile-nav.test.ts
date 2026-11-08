import { describe, expect, it } from 'vitest';
import { getMobileNavEntries } from './mobile-nav';

describe('sidebar mobile dérivée du manifeste', () => {
  it('rend le profil, les notifications, la bibliothèque, l’historique et le portefeuille', () => {
    const entries = getMobileNavEntries(false);
    expect(entries.map((entry) => entry.surface.defaultLabel)).toEqual([
      'Profil',
      'Notifications',
      'Bibliothèque',
      'Historique',
      'Portefeuille',
      'Paramètres et confidentialité',
      'Centre d’aide & Support',
    ]);
    expect(entries.map((entry) => entry.group)).toEqual([
      'main',
      'main',
      'main',
      'main',
      'main',
      'bottom',
      'bottom',
    ]);
  });

  it('ajoute le Studio Créateur uniquement pour un créateur ou un admin', () => {
    expect(getMobileNavEntries(false).map((entry) => entry.surface.id)).not.toContain(
      'mobile.sidebar.creator'
    );
    expect(getMobileNavEntries(true).map((entry) => entry.surface.id)).toContain(
      'mobile.sidebar.creator'
    );
  });

  it('conserve les routes et liens externes du manifeste', () => {
    const entries = getMobileNavEntries(true);
    const byId = new Map(entries.map((entry) => [entry.surface.id, entry.surface]));
    expect(byId.get('mobile.sidebar.profile')?.path).toBe('/user/[username]');
    expect(byId.get('mobile.sidebar.library')?.path).toBe('/library');
    expect(byId.get('mobile.sidebar.support')?.external).toBe(true);
  });
});
