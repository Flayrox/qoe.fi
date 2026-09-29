package abuse

// Métriques anti-abus (fiche 06 §11) : mesurer les DEUX erreurs opposées —
// l'abus laissé passer ET le légitime injustement bloqué. Les chiffres de
// succès ne sont jamais « nombre de comptes bannis » ; on surveille :
//
//   - verdicts automatiques par résultat et par raison (le bruit du noyau) ;
//   - revues humaines : classements (faux positifs avérés — le taux de
//     classement `allow` après revue est LA mesure du faux positif) vs
//     escalades par résultat ;
//   - profondeur de la file ouverte (dossiers en attente de revue) ;
//   - sujets les plus signalés récemment (prioriser la revue selon le
//     risque réel, pas selon le bruit — fiche §8).
//
// Lecture seule, superadmin uniquement (données nominatives d'investigation
// : seuls les agents habilités — fiche §9). Fenêtre glissante en jours,
// plafonnée (pas de full scan sans borne).

import (
	"context"
	"time"
)

// Metrics est l'instantané de santé anti-abus sur une fenêtre.
type Metrics struct {
	Since          time.Time      `json:"since"`
	AutoByResult   map[string]int `json:"autoByResult"`
	AutoByReason   map[string]int `json:"autoByReason"`
	HumanReviews   int            `json:"humanReviews"`
	HumanDismissed int            `json:"humanDismissed"`
	HumanByResult  map[string]int `json:"humanByResult"`
	// DismissalRate = classements / revues : la mesure du faux positif.
	// -1 si aucune revue (pas de division par zéro déguisée en 0%).
	DismissalRate float64        `json:"dismissalRate"`
	OpenQueue     int            `json:"openQueue"`
	TopSubjects   []SubjectStats `json:"topSubjects"`
}

// SubjectStats : un sujet chaud (signaux récents + dernier verdict).
type SubjectStats struct {
	SubjectType string `json:"subjectType"`
	SubjectID   string `json:"subjectId"`
	Signals     int    `json:"signals"`
	LastResult  string `json:"lastResult"`
}

// ComputeMetrics agrège les métriques sur les `days` derniers jours
// (1-90, défaut 30). Pool nil : instantané vide (dégradation ouverte).
func ComputeMetrics(ctx context.Context, pool SignalDB, days int, now time.Time) (Metrics, error) {
	m := Metrics{
		AutoByResult: map[string]int{}, AutoByReason: map[string]int{},
		HumanByResult: map[string]int{}, DismissalRate: -1, TopSubjects: []SubjectStats{},
	}
	if pool == nil {
		return m, nil
	}
	if days < 1 {
		days = 30
	}
	if days > 90 {
		days = 90
	}
	now = now.UTC()
	since := now.Add(-time.Duration(days) * 24 * time.Hour)
	m.Since = since

	// Verdicts par (auteur, résultat) sur la fenêtre.
	rows, err := pool.Query(ctx, `
		SELECT "decidedBy", "result", COUNT(*)
		FROM "RiskDecision" WHERE "createdAt" >= $1
		GROUP BY "decidedBy", "result"`, since)
	if err != nil {
		return m, err
	}
	for rows.Next() {
		var by, result string
		var n int
		if err := rows.Scan(&by, &result, &n); err != nil {
			rows.Close()
			return m, err
		}
		if by == "human" {
			m.HumanReviews += n
			m.HumanByResult[result] += n
			if result == string(DecisionAllow) {
				m.HumanDismissed += n
			}
		} else {
			m.AutoByResult[result] += n
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return m, err
	}

	// Raisons automatiques (unnest du tableau) : quel déclencheur parle ?
	rows, err = pool.Query(ctx, `
		SELECT r, COUNT(*) FROM "RiskDecision", UNNEST("reasonCodes") AS r
		WHERE "decidedBy" = 'auto' AND "createdAt" >= $1
		GROUP BY r ORDER BY COUNT(*) DESC LIMIT 20`, since)
	if err != nil {
		return m, err
	}
	for rows.Next() {
		var reason string
		var n int
		if err := rows.Scan(&reason, &n); err != nil {
			rows.Close()
			return m, err
		}
		m.AutoByReason[reason] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return m, err
	}

	if m.HumanReviews > 0 {
		m.DismissalRate = float64(m.HumanDismissed) / float64(m.HumanReviews)
	}

	// Profondeur de la file ouverte (même définition que la revue).
	var open int
	if err := pool.QueryRow(ctx, `
		WITH latest AS (
			SELECT DISTINCT ON ("subjectType", "subjectId") "result", "expiresAt"
			FROM "RiskDecision"
			ORDER BY "subjectType", "subjectId", "createdAt" DESC, "decidedBy" DESC, "id" DESC
		)
		SELECT COUNT(*) FROM latest
		WHERE "result" <> 'allow' AND ("expiresAt" IS NULL OR "expiresAt" > $1)`, now).Scan(&open); err != nil {
		return m, err
	}
	m.OpenQueue = open

	// Sujets chauds : signaux récents + dernier verdict connu.
	rows, err = pool.Query(ctx, `
		SELECT s."subjectType", s."subjectId", COUNT(*),
		       (SELECT d."result" FROM "RiskDecision" d
		         WHERE d."subjectType" = s."subjectType" AND d."subjectId" = s."subjectId"
		         ORDER BY d."createdAt" DESC, d."decidedBy" DESC, d."id" DESC LIMIT 1)
		FROM "AbuseSignal" s WHERE s."observedAt" >= $1
		GROUP BY s."subjectType", s."subjectId"
		ORDER BY COUNT(*) DESC LIMIT 10`, since)
	if err != nil {
		return m, err
	}
	defer rows.Close()
	for rows.Next() {
		var st SubjectStats
		var last *string
		if err := rows.Scan(&st.SubjectType, &st.SubjectID, &st.Signals, &last); err != nil {
			return m, err
		}
		if last != nil {
			st.LastResult = *last
		}
		m.TopSubjects = append(m.TopSubjects, st)
	}
	return m, rows.Err()
}
