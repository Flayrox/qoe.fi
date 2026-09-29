package abuse

// Persistance des signaux et des décisions (fiche 06 §9). Les règles restent
// pures (decision.go) ; ici on ne fait que : écrire des faits, relire des
// faits récents, persister les verdicts non triviaux.
//
// Règle d'or : un signal faible ne punit jamais. `allow` ne persiste aucun
// verdict (les faits restent requêtables pour la revue) ; tout autre verdict
// est persisté avec politique, version, raisons, auteur et expiration —
// traçabilité complète, sans exposer les seuils.

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SignalDB étend BudgetDB avec la lecture multi-lignes : charger les faits
// récents d'un sujet pour les soumettre à la politique (pure). Les poolers
// des modules et *pgxpool.Pool la satisfont.
type SignalDB interface {
	BudgetDB
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

var _ SignalDB = (*pgxpool.Pool)(nil)

// RecordSignal écrit un fait en AbuseSignal avec sa rétention. Best-effort :
// une panne de la table des signaux ne doit jamais invalider l'action
// métier (inscription, signalement) qui l'a produit — l'anti-abus observe,
// il ne bloque pas le chemin principal. Pool nil (tests purs) : no-op.
func RecordSignal(ctx context.Context, pool BudgetDB, signalType, subjectType, subjectID, source string, confidence int, retention time.Duration, now time.Time) {
	if pool == nil {
		return
	}
	// Normalisation UTC obligatoire : les colonnes sont des TIMESTAMP SANS
	// fuseau — un time.Time en heure locale (ex. CEST sur un poste de dev)
	// serait stocké avec ses champs calendaires locaux puis relu comme UTC,
	// décalant tous les faits de +2 h dans le futur et rendant les fenêtres
	// inopérantes. Même règle dans tout le package : la base ne voit que UTC.
	now = now.UTC()
	if confidence < 0 {
		confidence = 0
	}
	if confidence > 100 {
		confidence = 100
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO "AbuseSignal" ("id", "type", "subjectType", "subjectId", "source", "confidence", "ruleVersion", "observedAt", "expiresAt", "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		signalType, subjectType, subjectID, source, confidence, PolicyV1.Version, now, now.Add(retention), now)
	if err != nil {
		log.Printf("[abuse] signal %s non enregistré: %v", signalType, err)
	}
}

// loadRecentFacts relit les faits d'un sujet depuis la plus large fenêtre
// des règles v1 (7 jours) : les règles filtrent elles-mêmes par récence
// (Match), une seule requête suffit quel que soit le nombre de règles.
func loadRecentFacts(ctx context.Context, pool SignalDB, signalType, subjectType, subjectID string, since time.Time) ([]Fact, error) {
	rows, err := pool.Query(ctx, `
		SELECT "type", "subjectType", "subjectId", "observedAt"
		FROM "AbuseSignal"
		WHERE "type" = $1 AND "subjectType" = $2 AND "subjectId" = $3
		  AND "observedAt" >= $4
		ORDER BY "observedAt" DESC
		LIMIT 5000`,
		signalType, subjectType, subjectID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var facts []Fact
	for rows.Next() {
		var f Fact
		if err := rows.Scan(&f.Type, &f.SubjectType, &f.SubjectID, &f.ObservedAt); err != nil {
			return nil, err
		}
		facts = append(facts, f)
	}
	return facts, rows.Err()
}

// persistDecision écrit le verdict en RiskDecision : politique, version,
// raisons, auteur automate, expiration (les revues prioritaires se périment :
// une rafale d'il y a 3 jours n'est plus une urgence). Best-effort, comme
// toujours : un verdict perdu est rejouable depuis les faits.
func persistDecision(ctx context.Context, pool BudgetDB, out Outcome, subjectType, subjectID string, now time.Time) {
	now = now.UTC() // même règle qu'au-dessus : la base ne voit que UTC.
	_, err := pool.Exec(ctx, `
		INSERT INTO "RiskDecision" ("id", "policy", "version", "subjectType", "subjectId", "result", "reasonCodes", "decidedBy", "expiresAt", "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 'auto', $7, $8)`,
		out.Policy, out.Version, subjectType, subjectID, string(out.Decision), out.Reasons, now.Add(72*time.Hour), now)
	if err != nil {
		log.Printf("[abuse] verdict %s non persisté: %v", out.Decision, err)
	}
}

// EvaluateSubject compte les faits récents d'un sujet, applique la politique
// v1 et persiste le verdict s'il n'est pas `allow`. Retourne le verdict (ou
// `allow` en dégradation : pool nil, panne de lecture — observer ne casse
// jamais le chemin principal).
func EvaluateSubject(ctx context.Context, pool SignalDB, signalType, subjectType, subjectID string, now time.Time) Outcome {
	neutral := Outcome{Decision: DecisionAllow, Policy: PolicyV1.Name, Version: PolicyV1.Version}
	if pool == nil {
		return neutral
	}
	now = now.UTC() // comparer et charger en UTC : les faits stockés le sont.
	facts, err := loadRecentFacts(ctx, pool, signalType, subjectType, subjectID, now.Add(-7*24*time.Hour))
	if err != nil {
		log.Printf("[abuse] lecture signaux %s: %v (verdict neutre)", signalType, err)
		return neutral
	}
	out := PolicyV1.Evaluate(subjectType, subjectID, facts, now)
	if out.Decision == DecisionAllow {
		return out
	}
	persistDecision(ctx, pool, out, subjectType, subjectID, now)
	log.Printf("[abuse] verdict %s sujet %s:%s raisons=%v (revue priorisée, aucune sanction)",
		out.Decision, subjectType, subjectID, out.Reasons)
	return out
}
