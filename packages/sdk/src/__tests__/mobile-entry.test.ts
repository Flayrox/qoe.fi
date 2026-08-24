import { describe, it, expect } from 'vitest';
import * as sdkMobile from '../mobile';
import * as client from '../client';
import * as queryKeys from '../query-keys';
import * as shadow from '../shadow';

// 📱 Garde-fou Metro/React Native : le point d'entrée @qoe/sdk/mobile
// n'expose QUE les modules sans dépendance serveur (Prisma/Supabase/
// workers). Ce test échouera si quelqu'un ajoute un `export *` d'un
// module serveur dans mobile.ts — et donc casse le bundle mobile.

describe('@qoe/sdk/mobile — surface RN-safe', () => {
  it('expose le client HTTP universel et son type de config', () => {
    expect(sdkMobile.QoeApiClient).toBe(client.QoeApiClient);
  });

  it('expose les familles de query-keys', () => {
    expect(sdkMobile.feedKeys).toBe(queryKeys.feedKeys);
    expect(sdkMobile.userKeys).toBe(queryKeys.userKeys);
    expect(sdkMobile.tenantKeys).toBe(queryKeys.tenantKeys);
  });

  it('expose le shadow store optimiste', () => {
    expect(sdkMobile.updatePostShadow).toBe(shadow.updatePostShadow);
    expect(sdkMobile.POST_TOMBSTONE).toBe(shadow.POST_TOMBSTONE);
  });

  it("n'expose AUCUN module serveur (actions dashboard/admin/tenant…)", () => {
    const forbidden = [
      'getAdminDashboard',
      'adminAction',
      'createTenantAction',
      'goFetch',
      'isGoEnabled',
    ];
    for (const key of forbidden) {
      expect(key in sdkMobile, `${key} ne doit pas être exposé au mobile`).toBe(false);
    }
  });
});
