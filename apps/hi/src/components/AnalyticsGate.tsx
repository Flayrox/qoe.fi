import { cookies } from 'next/headers';
import { AnalyticsScript } from '@qoe/analytics/client';
import { COOKIE_CONSENT_COOKIE, analyticsAllowed, analyticsMode } from '@qoe/utils/cookie-consent';

// =====================================================================
// 📊 AnalyticsGate — la mesure d'audience n'est plus soumise à consentement
// =====================================================================
// La mesure d'audience tourne sans cookie, avec des adresses IP anonymisées
// avant stockage : elle est dispensée de consentement. Le script est donc
// servi à tout le monde, sauf à une personne qui s'y est explicitement
// opposée (un ancien « tout refuser » reste un refus, il ne devient jamais un
// accord).
//
// Le contrôle est fait au rendu serveur, pas seulement en JavaScript : un
// visiteur opposé ne télécharge même pas le script.
//
// Si la plateforme repasse un jour en régime « consent » (fournisseur non
// exempté), la même fonction exige alors un accord explicite enregistré.
// =====================================================================

export async function AnalyticsGate() {
  const mode = analyticsMode();
  const store = await cookies();
  const raw = store.get(COOKIE_CONSENT_COOKIE)?.value;
  if (!analyticsAllowed(raw, mode)) return null;

  return <AnalyticsScript exempt={mode === 'exempt'} />;
}
