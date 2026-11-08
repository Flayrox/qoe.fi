import { describe, expect, it } from 'vitest';
import { getMobileSurfaces } from '@qoe/config';

// 🔒 Ces listes sont figées : elles prouvent que les onglets consommés par
// `app-tabs.tsx` / `app-tabs.web.tsx` viennent du manifeste partagé et qu'une
// entrée retirée ou renommée ne passe pas inaperçue. Le branchement réel des
// deux fichiers est verrouillé par `app-tabs.wiring.test.ts` et le check 12
// d'`arch-audit.mjs`.
describe('onglets mobile issus du manifeste', () => {
  it('natif : profil, explorer, feed, activité', () => {
    const tabs = getMobileSurfaces('native');
    expect(tabs.map((tab) => tab.id)).toEqual([
      'mobile.profile',
      'mobile.explore',
      'mobile.feed',
      'mobile.notifications',
    ]);
    expect(tabs.map((tab) => tab.routeName)).toEqual([
      'profile',
      'explore',
      'index',
      'notifications',
    ]);
  });

  it('web : feed, explorer, activité, messages', () => {
    const tabs = getMobileSurfaces('web');
    expect(tabs.map((tab) => tab.routeName)).toEqual([
      'index',
      'explore',
      'notifications',
      'messages',
    ]);
    expect(tabs.map((tab) => tab.path)).toEqual(['/', '/explore', '/notifications', '/messages']);
  });
});
