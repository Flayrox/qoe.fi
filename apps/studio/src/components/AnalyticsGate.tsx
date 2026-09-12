import { cookies } from 'next/headers';
import { AnalyticsScript } from '@qoe/analytics/client';
import { COOKIE_CONSENT_COOKIE, analyticsAllowed, analyticsMode } from '@qoe/utils/cookie-consent';

// =====================================================================
// 📊 AnalyticsGate — la mesure d'audience n'est plus soumise à consentement
// =====================================================================
// Le studio charge la même mesure d'audience anonyme que le site public :
// sans cookie, IP anonymisée avant stockage. Elle est dispensée de
// consentement, donc servie par défaut ; une opposition enregistrée dans le
// navigateur la coupe, et le refus est respecté dès le rendu serveur.
// =====================================================================

export async function AnalyticsGate() {
  const mode = analyticsMode();
  const store = await cookies();
  const raw = store.get(COOKIE_CONSENT_COOKIE)?.value;
  if (!analyticsAllowed(raw, mode)) return null;

  return <AnalyticsScript exempt={mode === 'exempt'} />;
}
