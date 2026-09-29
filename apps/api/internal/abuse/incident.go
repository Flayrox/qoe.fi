package abuse

// Registre d'incidents (fiche 06 §9-§10) : quand une attaque est confirmée,
// la réponse ne tient pas dans un verdict par sujet — il faut un dossier
// tenu par le staff (qualifier une attaque est un jugement humain, jamais
// un verdict automate) : portée, mesures temporaires, suivi, communication.
//
// Le statut avance, il ne se réécrit pas : open → contained → resolved, avec
// reopened qui rouvre sans effacer (resolved ne repart jamais vers open
// directement). Les mesures s'AJOUTENT horodatées (pas d'écrasement) :
// l'historique est la matière du bilan et de la communication publique.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Kinds d'incidents (vocabulaire fermé, CHECK en base).
const (
	IncidentAccountFarm   = "account_farm"
	IncidentReportRaid    = "report_raid"
	IncidentSignupFlood   = "signup_flood"
	IncidentAPIAbuse      = "api_abuse"
	IncidentImpersonation = "impersonation"
	IncidentSpamWave      = "spam_wave"
	IncidentOther         = "other"
)

// Statuts (vocabulaire fermé, CHECK en base).
const (
	IncidentOpen      = "open"
	IncidentContained = "contained"
	IncidentResolved  = "resolved"
	IncidentReopened  = "reopened"
)

// ErrNoIncident : dossier inexistant (refus explicite).
var ErrNoIncident = errors.New("incident introuvable")

// ErrInvalidIncident : kind inconnu, titre hors bornes, ou transition de
// statut interdite (le message précise, sans jargon interne).
var ErrInvalidIncident = errors.New("incident invalide")

// IncidentKinds retourne le vocabulaire fermé des kinds (CHECK en base,
// source du générateur TS).
func IncidentKinds() []string {
	return []string{
		IncidentAccountFarm, IncidentReportRaid, IncidentSignupFlood,
		IncidentAPIAbuse, IncidentImpersonation, IncidentSpamWave, IncidentOther,
	}
}

// IncidentStatuses retourne le vocabulaire fermé des statuts.
func IncidentStatuses() []string {
	return []string{IncidentOpen, IncidentContained, IncidentResolved, IncidentReopened}
}

// ValidIncidentKind dit si le kind appartient au vocabulaire fermé.
func ValidIncidentKind(kind string) bool {
	switch kind {
	case IncidentAccountFarm, IncidentReportRaid, IncidentSignupFlood,
		IncidentAPIAbuse, IncidentImpersonation, IncidentSpamWave, IncidentOther:
		return true
	default:
		return false
	}
}

// ValidIncidentTransition dit si le statut peut avancer de from vers to.
// resolved ne repart jamais vers open (passer par reopened : la réouverture
// est un événement tracé, pas un effacement).
func ValidIncidentTransition(from, to string) bool {
	switch from {
	case IncidentOpen:
		return to == IncidentContained || to == IncidentResolved
	case IncidentContained:
		return to == IncidentResolved || to == IncidentReopened || to == IncidentOpen
	case IncidentReopened:
		return to == IncidentContained || to == IncidentResolved
	case IncidentResolved:
		return to == IncidentReopened
	default:
		return false
	}
}

// Incident est un dossier (sérialisable pour la console staff).
type Incident struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Kind       string  `json:"kind"`
	Status     string  `json:"status"`
	Scope      string  `json:"scope"`
	Impact     string  `json:"impact"`
	Measures   string  `json:"measures"`
	OpenedBy   string  `json:"openedBy"`
	ResolvedBy *string `json:"resolvedBy"`
	ResolvedAt *string `json:"resolvedAt"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
}

// incidentRow porte une ligne brute (horodatages typés) avant formatage.
type incidentRow struct {
	Incident
	resolvedAt *time.Time
	createdAt  time.Time
	updatedAt  time.Time
}

func (r incidentRow) format() Incident {
	d := r.Incident
	if r.resolvedAt != nil {
		s := r.resolvedAt.UTC().Format(time.RFC3339)
		d.ResolvedAt = &s
	}
	d.CreatedAt = r.createdAt.UTC().Format(time.RFC3339)
	d.UpdatedAt = r.updatedAt.UTC().Format(time.RFC3339)
	return d
}

// scanRow scanne les 12 colonnes dans l'ordre du SELECT (voir GetIncident).
func scanRow(row pgx.Row) (incidentRow, error) {
	var r incidentRow
	err := row.Scan(&r.ID, &r.Title, &r.Kind, &r.Status, &r.Scope, &r.Impact,
		&r.Measures, &r.OpenedBy, &r.ResolvedBy, &r.resolvedAt, &r.createdAt, &r.updatedAt)
	return r, err
}

const incidentColumns = `"id", "title", "kind", "status", "scope", "impact", "measures", "openedBy", "resolvedBy", "resolvedAt", "createdAt", "updatedAt"`

// OpenIncident ouvre un dossier (staff). Titre 5-200 caractères (CHECK en
// base, validé ici pour un refus propre avant l'INSERT).
func OpenIncident(ctx context.Context, pool BudgetDB, title, kind, scope, impact, openedBy string, now time.Time) (Incident, error) {
	if pool == nil {
		return Incident{}, errors.New("base indisponible")
	}
	title = strings.TrimSpace(title)
	if len([]rune(title)) < 5 || len([]rune(title)) > 200 {
		return Incident{}, fmt.Errorf("%w : titre de 5 à 200 caractères", ErrInvalidIncident)
	}
	if !ValidIncidentKind(kind) {
		return Incident{}, fmt.Errorf("%w : kind inconnu", ErrInvalidIncident)
	}
	now = now.UTC()
	r, err := scanRow(pool.QueryRow(ctx, `
		INSERT INTO "AntiAbuseIncident" ("id", "title", "kind", "status", "scope", "impact", "openedBy", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, 'open', $3, $4, $5, $6, $6)
		RETURNING `+incidentColumns, title, kind, scope, impact, openedBy, now))
	if err != nil {
		return Incident{}, err
	}
	return r.format(), nil
}

// GetIncident relit un dossier (refus explicite si inexistant).
func GetIncident(ctx context.Context, pool BudgetDB, id string) (Incident, error) {
	if pool == nil {
		return Incident{}, errors.New("base indisponible")
	}
	r, err := scanRow(pool.QueryRow(ctx,
		`SELECT `+incidentColumns+` FROM "AntiAbuseIncident" WHERE "id" = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Incident{}, ErrNoIncident
		}
		return Incident{}, err
	}
	return r.format(), nil
}

// ListIncidents renvoie les dossiers, ouverts d'abord puis plus récents
// d'abord (même ordre que la console). Filtre optionnel sur le statut
// (vide = tous). Pool nil : liste vide (dégradation ouverte).
func ListIncidents(ctx context.Context, pool SignalDB, status string, limit, offset int, now time.Time) ([]Incident, int, error) {
	if pool == nil {
		return nil, 0, nil
	}
	_ = now
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
		SELECT `+incidentColumns+`, COUNT(*) OVER () AS total
		FROM "AntiAbuseIncident" `+where+`
		ORDER BY CASE "status" WHEN 'open' THEN 0 WHEN 'reopened' THEN 1 WHEN 'contained' THEN 2 ELSE 3 END,
		         "createdAt" DESC
		LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var items []Incident
	total := 0
	for rows.Next() {
		var r incidentRow
		var n int
		cols := []any{&r.ID, &r.Title, &r.Kind, &r.Status, &r.Scope, &r.Impact,
			&r.Measures, &r.OpenedBy, &r.ResolvedBy, &r.resolvedAt, &r.createdAt, &r.updatedAt, &n}
		if err := rows.Scan(cols...); err != nil {
			return nil, 0, err
		}
		total = n
		items = append(items, r.format())
	}
	return items, total, rows.Err()
}

// UpdateIncident fait avancer un dossier : nouveau statut (transition
// validée), portée/impact révisés, et/ou mesure AJOUTÉE horodatée (jamais
// écrasée). Passer à resolved signe resolvedBy/resolvedAt ; rouvrir depuis
// resolved les efface (nouveau cycle, historique conservé dans measures).
// Champs vides = inchangés (sauf le statut, qui doit être valide s'il est
// fourni... un statut vide = inchangé lui aussi).
func UpdateIncident(ctx context.Context, pool BudgetDB, id, userID, status, scope, impact, measure string, now time.Time) (Incident, error) {
	if pool == nil {
		return Incident{}, errors.New("base indisponible")
	}
	now = now.UTC()
	cur, err := GetIncident(ctx, pool, id)
	if err != nil {
		return Incident{}, err
	}
	next := cur.Status
	if status != "" {
		if !ValidIncidentTransition(cur.Status, status) {
			return Incident{}, fmt.Errorf("%w : transition %s → %s interdite", ErrInvalidIncident, cur.Status, status)
		}
		next = status
	}
	// Mesure horodatée ajoutée à l'historique (pas d'écrasement : le passé
	// ne se réécrit pas, même pour corriger — on ajoute une mesure).
	measures := cur.Measures
	if m := strings.TrimSpace(measure); m != "" {
		entry := "[" + now.Format(time.RFC3339) + " " + userID + "] " + m
		if measures == "" {
			measures = entry
		} else {
			measures += "\n" + entry
		}
	}
	if scope == "" {
		scope = cur.Scope
	}
	if impact == "" {
		impact = cur.Impact
	}
	var resolvedBy *string
	var resolvedAt *time.Time
	if next == IncidentResolved && cur.Status != IncidentResolved {
		// Transition vers resolved = signature du clôtureur.
		resolvedBy = &userID
		resolvedAt = &now
	} else if next == IncidentResolved {
		// Déjà clos : on ajoute (mesure, portée...) sans re-signer — la
		// clôture garde son auteur d'origine (relire le brut, pas le formaté).
		_ = pool.QueryRow(ctx,
			`SELECT "resolvedBy", "resolvedAt" FROM "AntiAbuseIncident" WHERE "id" = $1`,
			id).Scan(&resolvedBy, &resolvedAt)
	}
	// Tout autre statut = cycle ouvert (y compris reopened depuis resolved :
	// on efface la signature close, l'historique des mesures garde la trace
	// du cycle précédent).
	r, err := scanRow(pool.QueryRow(ctx, `
		UPDATE "AntiAbuseIncident"
		SET "status" = $2, "scope" = $3, "impact" = $4, "measures" = $5,
		    "resolvedBy" = $6, "resolvedAt" = $7, "updatedAt" = $8
		WHERE "id" = $1
		RETURNING `+incidentColumns, id, next, scope, impact, measures, resolvedBy, resolvedAt, now))
	if err != nil {
		return Incident{}, err
	}
	return r.format(), nil
}
