package abuse

// Recours contre les mesures visant un compte (tranche 6, amorce).
// Règles verrouillées (voir migration 00042) :
//   - on ne conteste que POUR SOI (sujet user:<soi>) ;
//   - on ne conteste qu'un verdict non-allow non expiré (sinon rien à contester) ;
//   - UN SEUL recours ouvert par (sujet, ouvreur) — anti-saturation ;
//   - l'ouverture NE LÈVE RIEN (ni suspension ni limitation) ;
//   - upheld confirme (verdict humain qui reprend le résultat), overturned
//     classe (verdict humain allow) — les deux portent appealRef, liant
//     décision ↔ recours ;
//   - clos = clos (nouveau dossier pour rouvrir, historique conservé).

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Erreurs sentinelles (mappées en statuts HTTP par les handlers).
var (
	// ErrAppealForbidden : on ne conteste que pour soi.
	ErrAppealForbidden = errors.New("recours réservé à la personne visée par la mesure")
	// ErrNothingToAppeal : aucun verdict contestable (rien, que du allow, ou périmé).
	ErrNothingToAppeal = errors.New("aucune décision à contester pour ce sujet")
	// ErrAppealAlreadyOpen : un recours est déjà ouvert (anti-saturation).
	ErrAppealAlreadyOpen = errors.New("un recours est déjà ouvert pour ce sujet")
	// ErrAppealClosed : dossier clos — nouveau recours pour rouvrir.
	ErrAppealClosed = errors.New("recours clos (ouvrez-en un nouveau si besoin)")
	// ErrInvalidAppeal : outcome/statut invalide ou transition interdite.
	ErrInvalidAppeal = errors.New("recours invalide")
	// ErrAppealNotFound : dossier inexistant (refus explicite).
	ErrAppealNotFound = errors.New("recours introuvable")
)

// Outcomes (vocabulaire fermé, CHECK en base).
const (
	AppealUpheld     = "upheld"
	AppealOverturned = "overturned"
)

// Statuts (vocabulaire fermé, CHECK en base).
const (
	AppealOpen        = "open"
	AppealUnderReview = "under_review"
	AppealDecided     = "decided"
)

// AppealOutcomes retourne le vocabulaire fermé des outcomes.
func AppealOutcomes() []string {
	return []string{AppealUpheld, AppealOverturned}
}

// AppealStatuses retourne le vocabulaire fermé des statuts.
func AppealStatuses() []string {
	return []string{AppealOpen, AppealUnderReview, AppealDecided}
}

// ValidAppealOutcome dit si l'outcome tranche (upheld = la mesure était
// justifiée, overturned = faux positif avéré — les deux sont des verdicts,
// pas des états).
func ValidAppealOutcome(outcome string) bool {
	return outcome == AppealUpheld || outcome == AppealOverturned
}

// ValidAppealStatusTransition : open → under_review | decided ;
// under_review → decided. Pas de retour en arrière, pas de sur-place.
func ValidAppealStatusTransition(from, to string) bool {
	switch from {
	case AppealOpen:
		return to == AppealUnderReview || to == AppealDecided
	case AppealUnderReview:
		return to == AppealDecided
	default:
		return false
	}
}

// Appeal est un dossier de recours (sérialisable).
type Appeal struct {
	ID          string          `json:"id"`
	SubjectType string          `json:"subjectType"`
	SubjectID   string          `json:"subjectId"`
	DecisionID  *string         `json:"decisionId"`
	OpenedBy    string          `json:"openedBy"`
	Status      string          `json:"status"`
	Outcome     *string         `json:"outcome"`
	StaffNote   string          `json:"staffNote"`
	DecidedBy   *string         `json:"decidedBy"`
	DecidedAt   *string         `json:"decidedAt"`
	CreatedAt   string          `json:"createdAt"`
	Messages    []AppealMessage `json:"messages,omitempty"`
}

// AppealMessage est un message du dossier (utilisateur ou staff, auteur tracé).
type AppealMessage struct {
	ID        string `json:"id"`
	AuthorID  string `json:"authorId"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

// contestableDecision renvoie le dernier verdict non-allow et non expiré du
// sujet (celui qu'on conteste), ou ErrNothingToAppeal.
func contestableDecision(ctx context.Context, pool SignalDB, subjectType, subjectID string, now time.Time) (id, result string, reasons []string, err error) {
	err = pool.QueryRow(ctx, `
		SELECT "id", "result", "reasonCodes" FROM "RiskDecision"
		WHERE "subjectType" = $1 AND "subjectId" = $2
		  AND "result" <> 'allow' AND ("expiresAt" IS NULL OR "expiresAt" > $3)
		ORDER BY "createdAt" DESC, "decidedBy" DESC, "id" DESC LIMIT 1`,
		subjectType, subjectID, now).Scan(&id, &result, &reasons)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil, ErrNothingToAppeal
		}
		return "", "", nil, err
	}
	return id, result, reasons, nil
}

// OpenAppeal ouvre un recours (l'ouvreur conteste pour lui-même). Crée le
// dossier + le message initial. L'ouverture NE LÈVE RIEN (aucun verdict
// n'est touché — seule une décision overturned clôturera).
func OpenAppeal(ctx context.Context, pool SignalDB, subjectType, subjectID, openedBy, message string, now time.Time) (Appeal, error) {
	if pool == nil {
		return Appeal{}, errors.New("base indisponible")
	}
	// Périmètre de l'amorce : les mesures contre un COMPTE, contestées par
	// lui-même. Les contenus attendront le support complet (tranche 6).
	if subjectType != SubjectUser || subjectID != openedBy {
		return Appeal{}, ErrAppealForbidden
	}
	if m := strings.TrimSpace(message); len([]rune(m)) < 1 || len([]rune(m)) > 5000 {
		return Appeal{}, fmt.Errorf("%w : message de 1 à 5000 caractères", ErrInvalidAppeal)
	} else {
		message = m
	}
	now = now.UTC()
	decisionID, _, _, err := contestableDecision(ctx, pool, subjectType, subjectID, now)
	if err != nil {
		return Appeal{}, err
	}
	var id string
	err = pool.QueryRow(ctx, `
		INSERT INTO "Appeal" ("id", "subjectType", "subjectId", "decisionId", "openedBy", "status", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'open', $5, $5)
		RETURNING "id"`, subjectType, subjectID, decisionID, openedBy, now).Scan(&id)
	if err != nil {
		// Index unique partiel violé = recours déjà ouvert (anti-saturation).
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Appeal{}, ErrAppealAlreadyOpen
		}
		return Appeal{}, err
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO "AppealMessage" ("id", "appealId", "authorId", "body", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`, id, openedBy, message, now); err != nil {
		return Appeal{}, err
	}
	return GetAppeal(ctx, pool, id)
}

// GetAppeal relit un dossier avec ses messages (ouverts comme clos, ordre
// chronologique). Refus explicite si inexistant.
func GetAppeal(ctx context.Context, pool SignalDB, id string) (Appeal, error) {
	if pool == nil {
		return Appeal{}, errors.New("base indisponible")
	}
	var a Appeal
	var decidedAt *time.Time
	var createdAt time.Time
	err := pool.QueryRow(ctx, `
		SELECT "id", "subjectType", "subjectId", "decisionId", "openedBy", "status", "outcome",
		       "staffNote", "decidedBy", "decidedAt", "createdAt"
		FROM "Appeal" WHERE "id" = $1`, id).Scan(
		&a.ID, &a.SubjectType, &a.SubjectID, &a.DecisionID, &a.OpenedBy, &a.Status, &a.Outcome,
		&a.StaffNote, &a.DecidedBy, &decidedAt, &createdAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Appeal{}, ErrAppealNotFound
		}
		return Appeal{}, err
	}
	if decidedAt != nil {
		s := decidedAt.UTC().Format(time.RFC3339)
		a.DecidedAt = &s
	}
	a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	rows, err := pool.Query(ctx,
		`SELECT "id", "authorId", "body", "createdAt" FROM "AppealMessage"
		 WHERE "appealId" = $1 ORDER BY "createdAt", "id"`, id)
	if err != nil {
		return Appeal{}, err
	}
	defer rows.Close()
	a.Messages = []AppealMessage{}
	for rows.Next() {
		var m AppealMessage
		var at time.Time
		if err := rows.Scan(&m.ID, &m.AuthorID, &m.Body, &at); err != nil {
			return Appeal{}, err
		}
		m.CreatedAt = at.UTC().Format(time.RFC3339)
		a.Messages = append(a.Messages, m)
	}
	return a, rows.Err()
}

// AddUserMessage ajoute un message de l'ouvreur (seul lui écrit côté
// utilisateur — le staff passe par la console). Dossier clos = refusé
// (ErrAppealClosed) : pour rouvrir, on ouvre un nouveau recours.
func AddUserMessage(ctx context.Context, pool SignalDB, appealID, userID, body string, now time.Time) (Appeal, error) {
	if pool == nil {
		return Appeal{}, errors.New("base indisponible")
	}
	a, err := GetAppeal(ctx, pool, appealID)
	if err != nil {
		return Appeal{}, err
	}
	if a.OpenedBy != userID {
		return Appeal{}, ErrAppealForbidden
	}
	if a.Status == AppealDecided {
		return Appeal{}, ErrAppealClosed
	}
	if b := strings.TrimSpace(body); len([]rune(b)) < 1 || len([]rune(b)) > 5000 {
		return Appeal{}, fmt.Errorf("%w : message de 1 à 5000 caractères", ErrInvalidAppeal)
	} else {
		body = b
	}
	now = now.UTC()
	// Fenêtre de course assumée et traitée : le staff peut clore entre la
	// lecture et l'écriture — le message reste (parole conservée) et la
	// relecture ci-dessous le signale (ErrAppealClosed) au lieu de perdre
	// silencieusement l'écrit.
	if _, err := pool.Exec(ctx,
		`INSERT INTO "AppealMessage" ("id", "appealId", "authorId", "body", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
		appealID, userID, body, now); err != nil {
		return Appeal{}, err
	}
	// Relecture d'état : si le staff a clos entre-temps, le message reste
	// (parole conservée) mais on le signale.
	a, err = GetAppeal(ctx, pool, appealID)
	if err != nil {
		return Appeal{}, err
	}
	if a.Status == AppealDecided {
		return a, ErrAppealClosed
	}
	return a, nil
}

// ListUserAppeals renvoie les dossiers ouverts par un utilisateur (les siens
// uniquement — pas de lecture des recours d'autrui), plus récents d'abord.
func ListUserAppeals(ctx context.Context, pool SignalDB, userID string, limit, offset int) ([]Appeal, int, error) {
	if pool == nil {
		return nil, 0, nil
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := pool.Query(ctx, `
		SELECT "id", "subjectType", "subjectId", "decisionId", "openedBy", "status", "outcome",
		       "staffNote", "decidedBy", "decidedAt", "createdAt", COUNT(*) OVER () AS total
		FROM "Appeal" WHERE "openedBy" = $1
		ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var items []Appeal
	total := 0
	for rows.Next() {
		var a Appeal
		var decidedAt *time.Time
		var createdAt time.Time
		var n int
		if err := rows.Scan(&a.ID, &a.SubjectType, &a.SubjectID, &a.DecisionID, &a.OpenedBy,
			&a.Status, &a.Outcome, &a.StaffNote, &a.DecidedBy, &decidedAt, &createdAt, &n); err != nil {
			return nil, 0, err
		}
		if decidedAt != nil {
			s := decidedAt.UTC().Format(time.RFC3339)
			a.DecidedAt = &s
		}
		a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		total = n
		items = append(items, a)
	}
	return items, total, rows.Err()
}

// ListAllAppeals est la file staff (superadmin) : ouverts d'abord (open puis
// under_review), puis plus récents d'abord. Filtre optionnel sur le statut.
func ListAllAppeals(ctx context.Context, pool SignalDB, status string, limit, offset int) ([]Appeal, int, error) {
	if pool == nil {
		return nil, 0, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	where := ""
	args := []any{limit, offset}
	if status != "" {
		where = `WHERE "status" = $3`
		args = append(args, status)
	}
	rows, err := pool.Query(ctx, `
		SELECT "id", "subjectType", "subjectId", "decisionId", "openedBy", "status", "outcome",
		       "staffNote", "decidedBy", "decidedAt", "createdAt", COUNT(*) OVER () AS total
		FROM "Appeal" `+where+`
		ORDER BY CASE "status" WHEN 'open' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END,
		         "createdAt" DESC LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var items []Appeal
	total := 0
	for rows.Next() {
		var a Appeal
		var decidedAt *time.Time
		var createdAt time.Time
		var staffNote string
		var n int
		if err := rows.Scan(&a.ID, &a.SubjectType, &a.SubjectID, &a.DecisionID, &a.OpenedBy,
			&a.Status, &a.Outcome, &staffNote, &a.DecidedBy, &decidedAt, &createdAt, &n); err != nil {
			return nil, 0, err
		}
		// Note : staffNote volontairement EXCLU de la liste (motifs internes
		// d'enquête ≠ explication communicable — fiche 06 §8 ; scanné quand
		// même pour aligner les colonnes). Le détail staff le lit via
		// GetAppeal côté console.
		_ = staffNote
		if decidedAt != nil {
			s := decidedAt.UTC().Format(time.RFC3339)
			a.DecidedAt = &s
		}
		a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		total = n
		items = append(items, a)
	}
	return items, total, rows.Err()
}

// DecideAppeal tranche un recours (staff) :
//   - status seul (under_review) : prise en main, sans outcome ;
//   - decided + outcome : verdict humain sur le SUJET (upheld = reprend le
//     résultat contesté, overturned = allow), portant appealRef (lien
//     décision ↔ recours), + UPDATE du dossier (statut, outcome, note,
//     signature) + réponse staff éventuelle en message.
//
// L'ouverture n'a RIEN levé ; seule overturned lève (via le verdict allow).
func DecideAppeal(ctx context.Context, pool SignalDB, appealID, staffID, status, outcome, staffNote, reply string, now time.Time) (Appeal, error) {
	if pool == nil {
		return Appeal{}, errors.New("base indisponible")
	}
	now = now.UTC()
	a, err := GetAppeal(ctx, pool, appealID)
	if err != nil {
		return Appeal{}, err
	}
	if a.Status == AppealDecided {
		return Appeal{}, ErrAppealClosed
	}
	next := a.Status
	if status != "" {
		if !ValidAppealStatusTransition(a.Status, status) {
			return Appeal{}, fmt.Errorf("%w : transition %s → %s interdite", ErrInvalidAppeal, a.Status, status)
		}
		next = status
	}
	var decisionID *string
	if next == AppealDecided {
		if !ValidAppealOutcome(outcome) {
			return Appeal{}, fmt.Errorf("%w : outcome upheld ou overturned exigé pour clôturer", ErrInvalidAppeal)
		}
		// Verdict humain sur le sujet, relu à l'instant (jamais de mémoire
		// périmée entre l'ouverture et la décision) : overturned = allow
		// (faux positif avéré, la mesure tombe) ; upheld = on reprend le
		// résultat contesté tel quel (y compris needs_review : la revue
		// continue, avec l'avis humain tracé — upheld ne clôt que le
		// recours, pas la vigilance).
		_, res, reasons, err := contestableDecision(ctx, pool, a.SubjectType, a.SubjectID, now)
		if err != nil {
			return Appeal{}, err
		}
		result := DecisionAllow
		if outcome == AppealUpheld {
			result = Decision(res)
		}
		did, err := insertHumanVerdict(ctx, pool, PolicyV1.Name, PolicyV1.Version,
			a.SubjectType, a.SubjectID, reasons, "human:"+outcome, result, staffID, staffNote, appealID, nil, now)
		if err != nil {
			return Appeal{}, err
		}
		decisionID = &did
	}
	note := a.StaffNote
	if s := strings.TrimSpace(staffNote); s != "" {
		entry := "[" + now.Format(time.RFC3339) + " " + staffID + "] " + s
		if note == "" {
			note = entry
		} else {
			note += "\n" + entry
		}
	}
	var decidedBy *string
	var decidedAt *time.Time
	if next == AppealDecided {
		decidedBy = &staffID
		decidedAt = &now
	}
	if _, err := pool.Exec(ctx, `
		UPDATE "Appeal" SET "status" = $2, "outcome" = NULLIF($3, ''), "staffNote" = $4,
		       "decidedBy" = $5, "decidedAt" = $6, "updatedAt" = $7
		WHERE "id" = $1`,
		appealID, next, outcome, note, decidedBy, decidedAt, now); err != nil {
		return Appeal{}, err
	}
	if r := strings.TrimSpace(reply); r != "" {
		if _, err := pool.Exec(ctx,
			`INSERT INTO "AppealMessage" ("id", "appealId", "authorId", "body", "createdAt")
			 VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`, appealID, staffID, r, now); err != nil {
			return Appeal{}, err
		}
	}
	_ = decisionID
	return GetAppeal(ctx, pool, appealID)
}
