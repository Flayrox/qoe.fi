// =====================================================================
// 🔔 feature-consents — les promesses de notification du compte
// =====================================================================
// « Me prévenir » est un consentement durable, pas un réglage implicite :
// la personne doit pouvoir relire ce qu'elle a demandé et le retirer en un
// clic. L'état vient du serveur (`/v1/features/catalog`) ; le retrait passe
// par la route protégée, jamais par une écriture directe côté navigateur.
// =====================================================================

import { getFeature, localize } from '@qoe/ui';
import { getFeatureCatalogAction, unsubscribeFeatureAction } from '@/features/upcoming/actions';

export async function FeatureConsents() {
  const catalog = await getFeatureCatalogAction();
  const notified = catalog.filter((feature) => feature.notified);

  return (
    <div id="privacy-notify" className="space-y-4">
      <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Vous recevrez un seul email le jour du lancement de chaque fonctionnalité demandée. Retirer
        une promesse est immédiat et ne ferme aucun autre réglage du compte.
      </p>

      {notified.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune notification de lancement active.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {notified.map((feature) => {
            const definition = getFeature(feature.key);
            const label = definition ? localize(definition.copy.title) : feature.key;
            return (
              <li
                key={feature.key}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-foreground">{label}</span>
                <form action={unsubscribeFeatureAction.bind(null, feature.key)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Ne plus me prévenir
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
