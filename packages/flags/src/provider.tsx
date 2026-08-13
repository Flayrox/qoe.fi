// =====================================================================
// 🔌 provider.tsx — Provider client GrowthBook (hydration SSR no-flicker)
// =====================================================================
// 📖 Le layout (Server Component) charge le payload via
//    `getGrowthBookPayload()` et le passe ici. Le client s'initialise
//    SYNCHRONIQUEMENT avec ce payload → pas de requête réseau, pas de
//    flicker, et les flags sont déjà évalués au premier rendu.
//    Sans payload (GrowthBook down) → tous les flags retombent sur leurs
//    valeurs par défaut du registre.
// =====================================================================

'use client';

import { useMemo, type ReactNode } from 'react';
import {
  GrowthBook,
  GrowthBookProvider as GrowthBookSDKProvider,
  type GrowthBookPayload,
} from '@growthbook/growthbook-react';

export function GrowthBookProvider({
  payload,
  children,
}: {
  payload: GrowthBookPayload | null;
  children: ReactNode;
}) {
  const growthbook = useMemo(() => {
    const gb = new GrowthBook({
      apiHost: process.env.NEXT_PUBLIC_GROWTHBOOK_API_HOST,
      clientKey: process.env.NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY,
      enableDevMode: process.env.NODE_ENV !== 'production',
    });
    return gb.initSync({ payload: payload ?? { features: {} } });
  }, [payload]);

  return <GrowthBookSDKProvider growthbook={growthbook}>{children}</GrowthBookSDKProvider>;
}
