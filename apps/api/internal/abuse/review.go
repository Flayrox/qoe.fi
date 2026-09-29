package abuse

// File de revue staff (fiche 06 §8) : les verdicts automatiques non triviaux
// (`needs_review` et au-delà) sont listés pour un humain, qui les clôt par
// un verdict tracé (classement ou escalade). Règles :
//
//   - On ne revoit que le DERNIER verdict par sujet, non expiré, non `allow`.
//     Un classement humain (`allow`) ferme le dossier jusqu'aux prochains
//     faits (qui rouvrent naturellement un nouveau verdict auto).
//   - Le verdict humain reprend les codes de raison de l'automate + son
//     propre code (`human:<résultat>`) : la continuité automate → humain est
//     lisible sans exposer les seuils.
//   - `deciderId` = le staff qui a tranché ; `note` = son motif en clair
//     (colonne dédiée, jamais mélangée aux codes de raison stables).
//   - Aucune sanction automatique : même `suspend` tracé ici n'est qu'un
//     verdict — l'acte (UpdateModeration...) reste du côté des chemins de
//     modération existants, avec leurs propres gardes.

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrNoOpenDecision : aucun dossier ouvert pour ce sujet (déjà classé,
// expiré, ou jamais signalé). Refus explicite, pas de dossier fantôme.
var ErrNoOpenDecision = errors.New("aucune décision ouverte pour ce sujet")

// ErrInvalidHumanResult : le verdict humain proposé ne clôt rien
// (slow/challenge/needs_review ou valeur inconnue). Voir ValidHumanResult.
var ErrInvalidHumanResult = errors.New("verdict humain invalide (allow, limit_distribution, pause_sending ou suspend attendu)")

// OpenDecision est un dossier ouvert : le dernier verdict non trivial d'un
// sujet, avec le nombre de faits récents (contexte de la revue, pas preuve).
type OpenDecision struct {
	ID          string
	Policy      string
	Version     string
	SubjectType string
	SubjectID   string
	Result      string
	ReasonCodes []string
	DecidedBy   string
	DeciderID   *string
	CreatedAt   time.Time
	RecentFacts int
}

// ListOpenDecisions renvoie les dossiers ouverts (dernier verdict par sujet,
// non `allow`, non expiré), plus récents d'abord. Pool nil : liste vide
// (dégradation ouverte — la console affiche une file vide, pas une erreur).
func ListOpenDecisions(ctx context.Context, pool SignalDB, limit, offset int, now time.Time) ([]OpenDecision, int, error) {
	if pool == nil {
		return nil, 0, nil
	}
	now = now.UTC()
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := pool.Query(ctx, `
		WITH latest AS (
			SELECT DISTINCT ON ("subjectType", "subjectId") *
			FROM "RiskDecision"
			-- Départage déterministe si deux verdicts partagent la même
			-- milliseconde (tests, smokes) : la revue humaine prime sur
			-- l'automate, puis identifiant pour la stabilité totale.
			ORDER BY "subjectType", "subjectId", "createdAt" DESC, "decidedBy" DESC, "id" DESC
		)
		SELECT l."id", l."policy", l."version", l."subjectType", l."subjectId",
		       l."result", l."reasonCodes", l."decidedBy", l."deciderId", l."createdAt",
		       (SELECT COUNT(*) FROM "AbuseSignal" s
		         WHERE s."subjectType" = l."subjectType" AND s."subjectId" = l."subjectId"
		           AND s."observedAt" >= $1) AS recent_facts,
		       COUNT(*) OVER () AS total
		FROM latest l
		WHERE l."result" <> 'allow'
		  AND (l."expiresAt" IS NULL OR l."expiresAt" > $2)
		ORDER BY l."createdAt" DESC
		LIMIT $3 OFFSET $4`,
		now.Add(-7*24*time.Hour), now, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var items []OpenDecision
	total := 0
	for rows.Next() {
		var d OpenDecision
		if err := rows.Scan(&d.ID, &d.Policy, &d.Version, &d.SubjectType, &d.SubjectID,
			&d.Result, &d.ReasonCodes, &d.DecidedBy, &d.DeciderID, &d.CreatedAt,
			&d.RecentFacts, &total); err != nil {
			return nil, 0, err
		}
		items = append(items, d)
	}
	return items, total, rows.Err()
}

// ResolveDecision clôt le dossier ouvert d'un sujet par un verdict humain.
// Le dossier doit exister et être ouvert (sinon ErrNoOpenDecision) ; le
// résultat doit clôturer (sinon ErrInvalidHumanResult). Le verdict reprend
// les raisons de l'automate et ajoute `human:<résultat>` + note + auteur.
// Retourne l'identifiant du verdict humain (traçabilité, recours futur).
func ResolveDecision(ctx context.Context, pool BudgetDB, subjectType, subjectID, humanID string, result Decision, note string, now time.Time) (string, error) {
	if pool == nil {
		return "", errors.New("base indisponible")
	}
	if !ValidHumanResult(result) {
		return "", ErrInvalidHumanResult
	}
	now = now.UTC()
	var latestID, policy, version string
	var reasons []string
	var latestResult string
	var latestExpiry *time.Time
	err := pool.QueryRow(ctx, `
		SELECT "id", "policy", "version", "reasonCodes", "result", "expiresAt"
		FROM "RiskDecision"
		WHERE "subjectType" = $1 AND "subjectId" = $2
		ORDER BY "createdAt" DESC, "decidedBy" DESC, "id" DESC LIMIT 1`,
		subjectType, subjectID).Scan(&latestID, &policy, &version, &reasons, &latestResult, &latestExpiry)
	if err != nil {
		// Aucune ligne = pas de dossier (refus explicite) ; toute autre
		// erreur remonte (une panne n'est pas un dossier vide).
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNoOpenDecision
		}
		return "", err
	}
	var expiresAt *time.Time
	if latestResult == string(DecisionAllow) {
		return "", ErrNoOpenDecision // déjà classé : pas de re-clôture
	}
	if latestExpiry != nil && !latestExpiry.After(now) {
		return "", ErrNoOpenDecision // périmé : plus une urgence, pas un dossier
	}
	humanReasons := append(append([]string{}, reasons...), "human:"+string(result))
	var id string
	err = pool.QueryRow(ctx, `
		INSERT INTO "RiskDecision" ("id", "policy", "version", "subjectType", "subjectId", "result", "reasonCodes", "decidedBy", "deciderId", "note", "expiresAt", "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 'human', $7, NULLIF(TRIM($8), ''), $9, $10)
		RETURNING "id"`,
		policy, version, subjectType, subjectID, string(result), humanReasons, humanID, note, expiresAt, now).Scan(&id)
	if err != nil {
		return "", err
	}
	log.Printf("[abuse] revue humaine %s sujet %s:%s → %s (décideur %s)",
		latestID, subjectType, subjectID, result, humanID)
	return id, nil
}
