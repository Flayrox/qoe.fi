// Package subscriptions — droits manuels pré-Stripe (intérim assumé).
//
// Le staff octroie des paliers SANS que la personne soit abonnée (offert,
// presse, test, programmé) : qui, quoi, de quand à quand, pourquoi. Source
// UNIQUE des droits (HasEntitlement) — fini la colonne miroir (leçon des
// shadowbans : l'état dérivé bat l'état dupliqué, pas de sweep, pas de
// double écriture). Stripe, plus tard : le webhook appellera les MÊMES
// fonctions (octroi = période payée, impayé = révocation).
package subscriptions

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/abuse"
)

// Plans (vocabulaire fermé, CHECK en base). Pro = médias (aujourd'hui :
// personnalisation e-mails) ; Plus = lecteurs (dormant : aucune garde ne
// le lit encore — les octrois patientent, prêts pour les features).
const (
	PlanPro  = "pro"
	PlanPlus = "plus"
)

// Sujets (vocabulaire fermé, CHECK en base).
const (
	SubjectUser        = "user"
	SubjectPublication = "publication"
)

// Erreurs sentinelles (mappées en statuts HTTP par les handlers).
var (
	// ErrGrantNotFound : octroi inexistant (refus explicite).
	ErrGrantNotFound = errors.New("octroi introuvable")
	// ErrInvalidGrant : plan/sujet inconnu, dates incohérentes.
	ErrInvalidGrant = errors.New("octroi invalide")
)

// ValidPlan dit si le plan appartient au vocabulaire fermé.
func ValidPlan(plan string) bool {
	return plan == PlanPro || plan == PlanPlus
}

// ValidSubject dit si le sujet appartient au vocabulaire fermé.
func ValidSubject(subjectType string) bool {
	return subjectType == SubjectUser || subjectType == SubjectPublication
}

// Grant est un octroi (sérialisable pour la console).
type Grant struct {
	ID          string  `json:"id"`
	SubjectType string  `json:"subjectType"`
	SubjectID   string  `json:"subjectId"`
	Plan        string  `json:"plan"`
	StartsAt    string  `json:"startsAt"`
	EndsAt      *string `json:"endsAt"`
	GrantedBy   string  `json:"grantedBy"`
	Note        string  `json:"note"`
	CreatedAt   string  `json:"createdAt"`
	// Effective : droit actif à l'instant de lecture (pratique console).
	Effective bool `json:"effective"`
}

// isEffective centralise le calcul d'effectivité (même règle que
// HasEntitlement : début toléré +1s, fin stricte). UNE fonction pour les
// scans et les requêtes — jamais deux définitions qui divergent.
func isEffective(startsAt time.Time, endsAt *time.Time, now time.Time) bool {
	return !startsAt.After(now.Add(abuse.FutureTolerance)) && (endsAt == nil || endsAt.After(now))
}

// DB est la surface SQL du store (même forme que les autres stores).
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const grantColumns = `"id", "subjectType", "subjectId", "plan", "startsAt", "endsAt", "grantedBy", "note", "createdAt"`

func scanGrant(row pgx.Row, now time.Time) (Grant, error) {
	var g Grant
	var startsAt, createdAt time.Time
	var endsAt *time.Time
	err := row.Scan(&g.ID, &g.SubjectType, &g.SubjectID, &g.Plan, &startsAt, &endsAt,
		&g.GrantedBy, &g.Note, &createdAt)
	if err != nil {
		return Grant{}, err
	}
	g.StartsAt = startsAt.UTC().Format(time.RFC3339)
	if endsAt != nil {
		s := endsAt.UTC().Format(time.RFC3339)
		g.EndsAt = &s
	}
	g.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	g.Effective = isEffective(startsAt, endsAt, now)
	return g, nil
}

// HasDB est la surface minimale du contrôle des droits (un QueryRow) :
// les poolers étroits (settings : Exec + QueryRow, sans Query) la
// satisfont — pas besoin d'élargir leurs interfaces (ni de casser leurs
// mocks de tests) pour une simple question EXISTS.
type HasDB interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// HasEntitlement dit si le droit est effectif (source UNIQUE — fini les
// miroirs) : un octroi avec startsAt <= now < endsAt (NULL = sans fin).
// Pool nil : false (pas de droits sans base — défaut sûr, inverse des
// budgets où l'absence autorisait : ici l'absence INTERDIT).
// Tolérance +1s sur le DÉBUT (abuse.FutureTolerance) : l'émetteur (API) et
// la base (VPS) n'ont pas la même horloge à la milliseconde près — un octroi
// créé « maintenant » (startsAt = now() DB, postérieur au now Go de ~200ms
// en dev Mac→VPS, mesuré le 29/09) serait sinon inactif à sa propre seconde.
// Un droit 1s en avance n'est ni une sanction ni une faille (les tokens ont
// des leeways bien plus larges). La FIN reste stricte (pas de dépassement).
func HasEntitlement(ctx context.Context, pool HasDB, subjectType, subjectID, plan string, now time.Time) bool {
	if pool == nil {
		return false
	}
	now = abuse.UtcMs(now)
	since := now.Add(abuse.FutureTolerance)
	var ok bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM "SubscriptionGrant"
			WHERE "subjectType" = $1 AND "subjectId" = $2 AND "plan" = $3
			  AND "startsAt" <= $2 AND ("endsAt" IS NULL OR "endsAt" > $3)
		)`, subjectType, subjectID, plan, since, now).Scan(&ok)
	return err == nil && ok
}

// HasPro : la publication a-t-elle la personnalisation e-mails (et, demain,
// le reste du Pro) ? Raccourci de HasEntitlement — UNE fonction pour tous
// les chemins e-mails (workers, preview, test, save).
func HasPro(ctx context.Context, pool HasDB, publicationID string, now time.Time) bool {
	return HasEntitlement(ctx, pool, SubjectPublication, publicationID, PlanPro, now)
}

// HasPlus : l'utilisateur a-t-il les avantages lecteur Plus ? Deux voies
// (décision produit : Pro INCLUT Plus) :
//   - octroi direct : grant (user, plus) effectif ;
//   - via le studio : l'utilisateur possède une publication (User.
//     publicationId) sous octroi (publication, pro) effectif.
//
// Une seule requête (EXISTS + sous-requête owner). Pool nil : false.
func HasPlus(ctx context.Context, pool HasDB, userID string, now time.Time) bool {
	if pool == nil {
		return false
	}
	now = abuse.UtcMs(now)
	// Même tolérance +1s sur le début que HasEntitlement (horloges
	// émetteur/base) ; fin stricte.
	since := now.Add(abuse.FutureTolerance)
	var ok bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM "SubscriptionGrant" g
			WHERE ((g."subjectType" = 'user' AND g."subjectId" = $1 AND g."plan" = 'plus')
			    OR (g."subjectType" = 'publication' AND g."plan" = 'pro'
			        AND g."subjectId" = (SELECT u."publicationId" FROM "User" u WHERE u.id = $1::uuid)))
			  AND g."startsAt" <= $2 AND (g."endsAt" IS NULL OR g."endsAt" > $3)
		)`, userID, since, now).Scan(&ok)
	return err == nil && ok
}

// GrantPlan octroie un palier (staff) : sujet + plan validés, fin > début
// (NULL = sans fin), début futur = programmé. Note tracée (pourquoi).
func GrantPlan(ctx context.Context, pool DB, subjectType, subjectID, plan string, startsAt time.Time, endsAt *time.Time, grantedBy, note string, now time.Time) (Grant, error) {
	if pool == nil {
		return Grant{}, errors.New("base indisponible")
	}
	if !ValidSubject(subjectType) || !ValidPlan(plan) {
		return Grant{}, fmt.Errorf("%w : sujet ou plan inconnu", ErrInvalidGrant)
	}
	if strings.TrimSpace(subjectID) == "" {
		return Grant{}, fmt.Errorf("%w : sujet requis", ErrInvalidGrant)
	}
	startsAt = abuse.UtcMs(startsAt)
	if startsAt.IsZero() {
		startsAt = abuse.UtcMs(now)
	}
	if endsAt != nil {
		e := abuse.UtcMs(*endsAt)
		endsAt = &e
		if !e.After(startsAt) {
			return Grant{}, fmt.Errorf("%w : fin après début exigée", ErrInvalidGrant)
		}
	}
	now = now.UTC()
	var g Grant
	var starts, created time.Time
	var ends *time.Time
	err := pool.QueryRow(ctx, `
		INSERT INTO "SubscriptionGrant" ("id", "subjectType", "subjectId", "plan", "startsAt", "endsAt", "grantedBy", "note", "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING `+grantColumns,
		subjectType, strings.TrimSpace(subjectID), plan, startsAt, endsAt,
		grantedBy, strings.TrimSpace(note), now).Scan(
		&g.ID, &g.SubjectType, &g.SubjectID, &g.Plan, &starts, &ends,
		&g.GrantedBy, &g.Note, &created)
	if err != nil {
		return Grant{}, err
	}
	g.StartsAt = starts.UTC().Format(time.RFC3339)
	if ends != nil {
		s := ends.UTC().Format(time.RFC3339)
		g.EndsAt = &s
	}
	g.CreatedAt = created.UTC().Format(time.RFC3339)
	g.Effective = isEffective(starts, ends, now)
	return g, nil
}

// GetGrant relit un octroi (refus explicite si inexistant).
func GetGrant(ctx context.Context, pool DB, id string, now time.Time) (Grant, error) {
	if pool == nil {
		return Grant{}, errors.New("base indisponible")
	}
	g, err := scanGrant(pool.QueryRow(ctx,
		`SELECT `+grantColumns+` FROM "SubscriptionGrant" WHERE "id" = $1`, id), now.UTC())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Grant{}, ErrGrantNotFound
		}
		return Grant{}, err
	}
	return g, nil
}

// RevokeGrant révoque (fin immédiate — pas de suppression : l'historique
// reste : qui a donné quoi, quand, pourquoi). Déjà fini = inchangé (pas
// d'erreur : idempotent, rejouable). Un seul UPDATE conditionné + une
// relecture pour distinguer « inexistant » de « déjà fini ».
func RevokeGrant(ctx context.Context, pool DB, id string, now time.Time) (Grant, error) {
	if pool == nil {
		return Grant{}, errors.New("base indisponible")
	}
	now = abuse.UtcMs(now)
	updated, err := scanGrant(pool.QueryRow(ctx, `
		UPDATE "SubscriptionGrant" SET "endsAt" = $2
		WHERE "id" = $1 AND ("endsAt" IS NULL OR "endsAt" > $2)
		RETURNING `+grantColumns, id, now), now)
	if err == nil {
		return updated, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Grant{}, err
	}
	// 0 ligne : inexistant OU déjà fini — la relecture distingue (refus
	// explicite vs idempotence).
	return GetGrant(ctx, pool, id, now)
}

// ListGrants : historique par sujet (le plus récent d'abord). effectiveOnly
// ne garde que les droits actifs (console : voir qui a quoi MAINTENANT).
// Deux requêtes explicites plutôt qu'un WHERE construit : lisible, pas de
// placeholders comptés à la main.
func ListGrants(ctx context.Context, pool DB, subjectType, subjectID string, effectiveOnly bool, limit int, now time.Time) ([]Grant, error) {
	if pool == nil {
		return []Grant{}, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	now = now.UTC()
	var rows pgx.Rows
	var err error
	if effectiveOnly {
		rows, err = pool.Query(ctx, `
			SELECT `+grantColumns+` FROM "SubscriptionGrant"
			WHERE "subjectType" = $1 AND "subjectId" = $2
			  AND "startsAt" <= $3 AND ("endsAt" IS NULL OR "endsAt" > $3)
			ORDER BY "createdAt" DESC LIMIT $4`, subjectType, subjectID, now, limit)
	} else {
		rows, err = pool.Query(ctx, `
			SELECT `+grantColumns+` FROM "SubscriptionGrant"
			WHERE "subjectType" = $1 AND "subjectId" = $2
			ORDER BY "createdAt" DESC LIMIT $3`, subjectType, subjectID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Grant{}
	for rows.Next() {
		g, err := scanGrantRow(rows, now)
		if err != nil {
			return nil, err
		}
		items = append(items, g)
	}
	return items, rows.Err()
}

// ListRecentGrants : les octrois tous sujets (file console, plus récents
// d'abord). Filtres optionnels plan et effectifs-only ("" et false = tout).
// Les 4 combinaisons en requêtes explicites (pas de WHERE construit — même
// discipline que ListGrants : lisible, pas de placeholders comptés).
func ListRecentGrants(ctx context.Context, pool DB, plan string, effectiveOnly bool, limit, offset int, now time.Time) ([]Grant, int, error) {
	if pool == nil {
		// Jamais nil : une slice non initialisée sérialise en `null` dans
		// encoding/json, et le composant serveur admin crashe sur
		// `data.items.filter(...)` (léçon du crash « This page couldn't load »).
		return []Grant{}, 0, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	now = now.UTC()
	base := `SELECT ` + grantColumns + `, COUNT(*) OVER () AS total FROM "SubscriptionGrant"`
	order := ` ORDER BY "createdAt" DESC LIMIT $%d OFFSET $%d`
	var rows pgx.Rows
	var err error
	switch {
	case plan != "" && effectiveOnly:
		rows, err = pool.Query(ctx, base+` WHERE "plan" = $1 AND "startsAt" <= $2 AND ("endsAt" IS NULL OR "endsAt" > $2)`+fmt.Sprintf(order, 3, 4), plan, now, limit, offset)
	case plan != "":
		rows, err = pool.Query(ctx, base+` WHERE "plan" = $1`+fmt.Sprintf(order, 2, 3), plan, limit, offset)
	case effectiveOnly:
		rows, err = pool.Query(ctx, base+` WHERE "startsAt" <= $1 AND ("endsAt" IS NULL OR "endsAt" > $1)`+fmt.Sprintf(order, 2, 3), now, limit, offset)
	default:
		rows, err = pool.Query(ctx, base+fmt.Sprintf(order, 1, 2), limit, offset)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []Grant{}
	total := 0
	for rows.Next() {
		var g Grant
		var startsAt, createdAt time.Time
		var endsAt *time.Time
		var n int
		if err := rows.Scan(&g.ID, &g.SubjectType, &g.SubjectID, &g.Plan, &startsAt, &endsAt,
			&g.GrantedBy, &g.Note, &createdAt, &n); err != nil {
			return nil, 0, err
		}
		g.StartsAt = startsAt.UTC().Format(time.RFC3339)
		if endsAt != nil {
			s := endsAt.UTC().Format(time.RFC3339)
			g.EndsAt = &s
		}
		g.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		g.Effective = isEffective(startsAt, endsAt, now)
		total = n
		items = append(items, g)
	}
	return items, total, rows.Err()
}

// scanGrantRow scanne une ligne de liste (même ordre que grantColumns).
func scanGrantRow(rows pgx.Rows, now time.Time) (Grant, error) {
	var g Grant
	var startsAt, createdAt time.Time
	var endsAt *time.Time
	err := rows.Scan(&g.ID, &g.SubjectType, &g.SubjectID, &g.Plan, &startsAt, &endsAt,
		&g.GrantedBy, &g.Note, &createdAt)
	if err != nil {
		return Grant{}, err
	}
	g.StartsAt = startsAt.UTC().Format(time.RFC3339)
	if endsAt != nil {
		s := endsAt.UTC().Format(time.RFC3339)
		g.EndsAt = &s
	}
	g.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	g.Effective = isEffective(startsAt, endsAt, now)
	return g, nil
}
