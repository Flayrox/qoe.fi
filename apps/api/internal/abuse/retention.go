package abuse

// Rétention (fiche 06 §9) : pas de fichier comportemental perpétuel.
//
//   - Les signaux portent leur propre échéance (`expiresAt`, fixée à
//     l'enregistrement selon le type : 24 h les inscriptions, 7 j les
//     signalements). Expiré = supprimable, sans revue : c'était un fait
//     d'observation, pas un acte.
//   - Les budgets sont des compteurs par fenêtre journalière : une fenêtre
//     vieille de plus de 7 jours ne sera plus jamais consommée (les plafonds
//     sont par jour calendaire). Les verdicts (RiskDecision), eux, ne sont
//     JAMAIS purgés ici : ce sont des actes traçables, leur sort relève de
//     la politique d'archivage juridique, pas du ménage.
//   - Appelée par le tick du worker planifié (même boucle que la levée des
//     shadowbans). Idempotente, best-effort : une purge ratée sera rejouée
//     au tick suivant — elle ne bloque jamais les publications programmées.

import (
	"context"
	"time"
)

// BudgetRetention : âge maximal d'une fenêtre de budget conservée. Au-delà,
// le compteur est mort (fenêtre journalière passée) et ne sert qu'à grossir
// la table.
const BudgetRetention = 7 * 24 * time.Hour

// PurgeExpiredAbuseData supprime les signaux expirés et les fenêtres de
// budget périmées. Retourne les deux compteurs (observabilité du tick).
// Exportée pour le worker, le smoke et les tests — la logique n'a qu'une
// seule implémentation.
func PurgeExpiredAbuseData(ctx context.Context, pool BudgetDB, now time.Time) (signals, budgets int64, err error) {
	if pool == nil {
		return 0, 0, nil
	}
	now = now.UTC()
	tag, err := pool.Exec(ctx, `DELETE FROM "AbuseSignal" WHERE "expiresAt" <= $1`, now)
	if err != nil {
		return 0, 0, err
	}
	signals = tag.RowsAffected()
	tag, err = pool.Exec(ctx, `DELETE FROM "CapabilityBudget" WHERE "window" < $1`, now.Add(-BudgetRetention))
	if err != nil {
		return signals, 0, err
	}
	return signals, tag.RowsAffected(), nil
}
