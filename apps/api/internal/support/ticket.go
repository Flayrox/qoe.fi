// Package support — dossiers du support général (tranche 6).
//
// Le recours (package abuse) conteste une mesure précise avec effet ; le
// support couvre le RESTE (compte perdu/restreint, contenu, API, import,
// livraison, signalement, autre). Deux bounded contexts volontairement
// séparés (tables, statuts et règles propres) : un recours n'est pas un
// ticket, un ticket ne lève rien. La duplication apparente avec
// abuse/appeal.go est assumée — fusionner serait recréer le bouton
// universel que la fiche 06 interdit.
package support

import (
	"context"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/flags"
)

// Kinds (vocabulaire fermé, CHECK en base).
const (
	KindAccountRestricted = "account_restricted"
	KindAccountLost       = "account_lost"
	KindContentModeration = "content_moderation"
	KindAPIAccess         = "api_access"
	KindImportIssue       = "import_issue"
	KindDelivery          = "delivery"
	KindReportIssue       = "report_issue"
	KindOther             = "other"
)

// Statuts (vocabulaire fermé, CHECK en base).
const (
	StatusOpen        = "open"
	StatusUnderReview = "under_review"
	StatusClosed      = "closed"
)

// Erreurs sentinelles (mappées en statuts HTTP par les handlers).
var (
	// ErrTicketNotFound : dossier inexistant (refus explicite).
	ErrTicketNotFound = errors.New("dossier introuvable")
	// ErrInvalidTicket : kind inconnu, sujet/message hors bornes, transition
	// interdite, clôture par l'ouvreur (conflit d'intérêts).
	ErrInvalidTicket = errors.New("dossier invalide")
	// ErrTicketAlreadyOpen : un dossier est déjà ouvert pour (ouvreur, kind).
	ErrTicketAlreadyOpen = errors.New("un dossier est déjà ouvert pour ce motif")
	// ErrTicketClosed : dossier clos — nouveau dossier pour rouvrir.
	ErrTicketClosed = errors.New("dossier clos (ouvrez-en un nouveau si besoin)")
	// ErrTicketForbidden : pas votre dossier.
	ErrTicketForbidden = errors.New("dossier réservé à son ouvreur")
)

// Kinds retourne le vocabulaire fermé des kinds (CHECK en base, source du
// générateur TS).
func Kinds() []string {
	return []string{
		KindAccountRestricted, KindAccountLost, KindContentModeration,
		KindAPIAccess, KindImportIssue, KindDelivery, KindReportIssue, KindOther,
	}
}

// Statuses retourne le vocabulaire fermé des statuts.
func Statuses() []string {
	return []string{StatusOpen, StatusUnderReview, StatusClosed}
}

// ActionSupportPublic est l'action budgétée du formulaire public (vitrine) :
// 3 dossiers/jour par adresse — au-delà, 429 explicite (pas de furtivité :
// c'est une urgence assumée comme le coupe-feu, pas de l'anti-abus silencieux).
const ActionSupportPublic = "support.public"

// PublicCapPerEmailDay : 3 dossiers publics par adresse et par jour. Un
// besoin réel tient dans un fil (messages illimités dans le dossier ouvert) ;
// au-delà, c'est du spam ou une boucle cassée.
const PublicCapPerEmailDay = 3

// ErrPublicBudgetExhausted : plafond public atteint → 429 + Retry-After.
var ErrPublicBudgetExhausted = errors.New("trop de demandes aujourd'hui, réessayez demain")

// ErrPublicSuspended : coupe-feu engagé → 503 explicite (urgence assumée,
// Retry-After indicatif — même doctrine que les inscriptions).
var ErrPublicSuspended = errors.New("dépôts temporairement suspendus (maintenance anti-abus)")

// logPublicKillOnce : un seul avertissement par processus en cas de lecture
// impossible (sinon noyade des logs à chaque dépôt pendant une panne).
var logPublicKillOnce sync.Once

// PublicKillEngaged dit si le coupe-feu du formulaire public est engagé
// (flags.SupportPublicKill). Lecture DIRECTE (effet immédiat, pas de cache
// TTL) ; clé absente ou DB en panne → désengagé + 1 log (dégradation
// ouverte : un coupe-feu illisible ne bloque pas l'aide).
func PublicKillEngaged(ctx context.Context, pool DB) bool {
	if pool == nil {
		return false
	}
	var on bool
	err := pool.QueryRow(ctx, `SELECT "is_enabled" FROM "feature_flags" WHERE "key" = $1`, flags.SupportPublicKill).Scan(&on)
	if err != nil {
		logPublicKillOnce.Do(func() {
			log.Printf("[support] lecture coupe-feu public: %v (désengagé par dégradation)", err)
		})
		return false
	}
	return on
}

var emailFormat = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// ValidKind dit si le kind appartient au vocabulaire fermé.
func ValidKind(kind string) bool {
	switch kind {
	case KindAccountRestricted, KindAccountLost, KindContentModeration,
		KindAPIAccess, KindImportIssue, KindDelivery, KindReportIssue, KindOther:
		return true
	default:
		return false
	}
}

// ValidTransition : open → under_review | closed ; under_review → closed.
// Pas de retour en arrière, pas de sur-place (rouvrir = nouveau dossier).
func ValidTransition(from, to string) bool {
	switch from {
	case StatusOpen:
		return to == StatusUnderReview || to == StatusClosed
	case StatusUnderReview:
		return to == StatusClosed
	default:
		return false
	}
}

// Ticket est un dossier (sérialisable).
type Ticket struct {
	ID          string          `json:"id"`
	Kind        string          `json:"kind"`
	Subject     string          `json:"subject"`
	OpenedBy    string          `json:"openedBy"`
	Status      string          `json:"status"`
	Assignee    *string         `json:"assignee"`
	RelatedType string          `json:"relatedType"`
	RelatedID   string          `json:"relatedId"`
	StaffNote   string          `json:"staffNote"`
	ClosedBy    *string         `json:"closedBy"`
	ClosedAt    *string         `json:"closedAt"`
	CreatedAt   string          `json:"createdAt"`
	Messages    []TicketMessage `json:"messages,omitempty"`
}

// TicketMessage est un message du dossier (utilisateur ou staff).
type TicketMessage struct {
	ID        string `json:"id"`
	AuthorID  string `json:"authorId"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

// DB est la surface SQL du store (les poolers des modules et *pgxpool.Pool
// la satisfont — même forme que abuse.SignalDB, sans dépendre de abuse).
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func checkBody(body string) (string, error) {
	b := strings.TrimSpace(body)
	if len([]rune(b)) < 1 || len([]rune(b)) > 5000 {
		return "", fmt.Errorf("%w : message de 1 à 5000 caractères", ErrInvalidTicket)
	}
	return b, nil
}

// OpenTicket ouvre un dossier (Y COMPRIS compte restreint — l'auth n'exclut
// pas les suspendus). L'ouverture NE CHANGE RIEN (aucune suspension levée,
// aucune permission accordée) : seule une action staff explicite agit, par
// les chemins existants, jamais ici.
func OpenTicket(ctx context.Context, pool DB, kind, subject, openedBy, message, relatedType, relatedID string, now time.Time) (Ticket, error) {
	if pool == nil {
		return Ticket{}, errors.New("base indisponible")
	}
	if !ValidKind(kind) {
		return Ticket{}, fmt.Errorf("%w : kind inconnu", ErrInvalidTicket)
	}
	subject = strings.TrimSpace(subject)
	if len([]rune(subject)) < 5 || len([]rune(subject)) > 200 {
		return Ticket{}, fmt.Errorf("%w : sujet de 5 à 200 caractères", ErrInvalidTicket)
	}
	message, err := checkBody(message)
	if err != nil {
		return Ticket{}, err
	}
	now = now.UTC()
	var id string
	err = pool.QueryRow(ctx, `
		INSERT INTO "SupportTicket" ("id", "kind", "subject", "openedBy", "status", "relatedType", "relatedId", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, 'open', $4, $5, $6, $6)
		RETURNING "id"`, kind, subject, openedBy, relatedType, relatedID, now).Scan(&id)
	if err != nil {
		// Index unique partiel violé = dossier déjà ouvert (anti-saturation).
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Ticket{}, ErrTicketAlreadyOpen
		}
		return Ticket{}, err
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO "SupportMessage" ("id", "ticketId", "authorId", "body", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`, id, openedBy, message, now); err != nil {
		return Ticket{}, err
	}
	return GetTicket(ctx, pool, id)
}

const ticketColumns = `"id", "kind", "subject", "openedBy", "status", "assignee", "relatedType", "relatedId", "staffNote", "closedBy", "closedAt", "createdAt"`

// GuestPrefix marque un dossier ouvert sans compte (formulaire public de la
// vitrine) : openedBy = "guest:<email normalisé>". Le rattachement au compte
// (si l'e-mail correspond à un utilisateur) se fait à la connexion — en
// attendant, le dossier est suivi par le staff via l'e-mail (résidu acté :
// pas de boucle de notification, le staff répond et l'utilisateur revient
// avec sa référence).
const GuestPrefix = "guest:"

// GuestOpener normalise l'identité invitée (e-mail minuscule, rogné).
func GuestOpener(email string) string {
	return GuestPrefix + strings.ToLower(strings.TrimSpace(email))
}

// OpenPublicTicket ouvre un dossier depuis le formulaire public (vitrine,
// SANS compte obligatoire) :
//   - connecté (userID non vide) → dossier au compte (openedBy = userID) ;
//   - sinon → dossier invité (openedBy = guest:<email>, e-mail valide exigé).
//
// Budget : 3/jour par adresse (429 au-delà). L'ouverture NE CHANGE RIEN,
// comme les autres voies. Le name (optionnel, ≤100) est préfixé au message
// (traçabilité de l'interlocuteur — jamais un champ libre requêtable).
func OpenPublicTicket(ctx context.Context, pool DB, userID, name, email, kind, subject, message string, now time.Time) (Ticket, error) {
	if pool == nil {
		return Ticket{}, errors.New("base indisponible")
	}
	// Coupe-feu d'abord (avant toute validation coûteuse comme le budget) :
	// engagé → refus AVANT toute écriture.
	if PublicKillEngaged(ctx, pool) {
		return Ticket{}, ErrPublicSuspended
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if !emailFormat.MatchString(email) {
		return Ticket{}, fmt.Errorf("%w : adresse e-mail invalide", ErrInvalidTicket)
	}
	if n := strings.TrimSpace(name); n != "" {
		if len([]rune(n)) > 100 {
			return Ticket{}, fmt.Errorf("%w : nom trop long (100 max)", ErrInvalidTicket)
		}
		message = n + " — " + message
	}
	now = now.UTC()
	ok, err := abuse.ConsumeBudget(ctx, pool, "email_day", email, ActionSupportPublic, abuse.DailyWindow(now), 1, PublicCapPerEmailDay)
	if err != nil {
		return Ticket{}, err
	}
	if !ok {
		return Ticket{}, ErrPublicBudgetExhausted
	}
	openedBy := userID
	if openedBy == "" {
		openedBy = GuestOpener(email)
	}
	return OpenTicket(ctx, pool, kind, subject, openedBy, message, "", "", now)
}

// GetTicket relit un dossier avec ses messages (ordre chronologique).
func GetTicket(ctx context.Context, pool DB, id string) (Ticket, error) {
	if pool == nil {
		return Ticket{}, errors.New("base indisponible")
	}
	var t Ticket
	var closedAt *time.Time
	var createdAt time.Time
	err := pool.QueryRow(ctx,
		`SELECT `+ticketColumns+` FROM "SupportTicket" WHERE "id" = $1`, id).Scan(
		&t.ID, &t.Kind, &t.Subject, &t.OpenedBy, &t.Status, &t.Assignee,
		&t.RelatedType, &t.RelatedID, &t.StaffNote, &t.ClosedBy, &closedAt, &createdAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Ticket{}, ErrTicketNotFound
		}
		return Ticket{}, err
	}
	if closedAt != nil {
		s := closedAt.UTC().Format(time.RFC3339)
		t.ClosedAt = &s
	}
	t.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	rows, err := pool.Query(ctx,
		`SELECT "id", "authorId", "body", "createdAt" FROM "SupportMessage"
		 WHERE "ticketId" = $1 ORDER BY "createdAt", "id"`, id)
	if err != nil {
		return Ticket{}, err
	}
	defer rows.Close()
	t.Messages = []TicketMessage{}
	for rows.Next() {
		var m TicketMessage
		var at time.Time
		if err := rows.Scan(&m.ID, &m.AuthorID, &m.Body, &at); err != nil {
			return Ticket{}, err
		}
		m.CreatedAt = at.UTC().Format(time.RFC3339)
		t.Messages = append(t.Messages, m)
	}
	return t, rows.Err()
}

// AddUserMessage ajoute un message de l'ouvreur (dossier clos = refusé).
func AddUserMessage(ctx context.Context, pool DB, ticketID, userID, body string, now time.Time) (Ticket, error) {
	if pool == nil {
		return Ticket{}, errors.New("base indisponible")
	}
	t, err := GetTicket(ctx, pool, ticketID)
	if err != nil {
		return Ticket{}, err
	}
	if t.OpenedBy != userID {
		return Ticket{}, ErrTicketForbidden
	}
	if t.Status == StatusClosed {
		return Ticket{}, ErrTicketClosed
	}
	body, err = checkBody(body)
	if err != nil {
		return Ticket{}, err
	}
	now = now.UTC()
	if _, err := pool.Exec(ctx,
		`INSERT INTO "SupportMessage" ("id", "ticketId", "authorId", "body", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
		ticketID, userID, body, now); err != nil {
		return Ticket{}, err
	}
	t, err = GetTicket(ctx, pool, ticketID)
	if err != nil {
		return Ticket{}, err
	}
	if t.Status == StatusClosed {
		return t, ErrTicketClosed // clos entre-temps : parole conservée, signalé
	}
	return t, nil
}

// scanTicketList scanne une ligne de liste (+ total window).
func scanTicketList(rows pgx.Rows) ([]Ticket, int, error) {
	items := []Ticket{}
	total := 0
	for rows.Next() {
		var t Ticket
		var closedAt *time.Time
		var createdAt time.Time
		var n int
		if err := rows.Scan(&t.ID, &t.Kind, &t.Subject, &t.OpenedBy, &t.Status,
			&t.Assignee, &t.RelatedType, &t.RelatedID, &t.StaffNote,
			&t.ClosedBy, &closedAt, &createdAt, &n); err != nil {
			return nil, 0, err
		}
		if closedAt != nil {
			s := closedAt.UTC().Format(time.RFC3339)
			t.ClosedAt = &s
		}
		t.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		total = n
		items = append(items, t)
	}
	return items, total, rows.Err()
}

// ListUserTickets : les dossiers de l'utilisateur (les siens uniquement).
func ListUserTickets(ctx context.Context, pool DB, userID string, limit, offset int) ([]Ticket, int, error) {
	if pool == nil {
		return []Ticket{}, 0, nil
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := pool.Query(ctx, `
		SELECT `+ticketColumns+`, COUNT(*) OVER () AS total
		FROM "SupportTicket" WHERE "openedBy" = $1
		ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	return scanTicketList(rows)
}

// ListAllTickets : file staff (ouverts d'abord). staffNote EXCLU de la liste
// (motifs internes ≠ explication communicable) — scanné quand même pour
// aligner les colonnes.
func ListAllTickets(ctx context.Context, pool DB, status string, limit, offset int) ([]Ticket, int, error) {
	if pool == nil {
		return []Ticket{}, 0, nil
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
		SELECT `+ticketColumns+`, COUNT(*) OVER () AS total
		FROM "SupportTicket" `+where+`
		ORDER BY CASE "status" WHEN 'open' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END,
		         "createdAt" DESC LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items, total, err := scanTicketList(rows)
	if err != nil {
		return nil, 0, err
	}
	// La liste ne porte pas les notes internes : vidées après scan.
	for i := range items {
		items[i].StaffNote = ""
	}
	return items, total, nil
}

// AssignTicket assigne un dossier (prise en main). L'assignation à soi-même
// est tracée mais tolérée (structure solo : interdire bloquerait tout) —
// seule la CLÔTURE par l'ouvreur est refusée (conflit d'intérêts).
func AssignTicket(ctx context.Context, pool DB, id, staffID string, now time.Time) (Ticket, error) {
	if pool == nil {
		return Ticket{}, errors.New("base indisponible")
	}
	now = now.UTC()
	t, err := GetTicket(ctx, pool, id)
	if err != nil {
		return Ticket{}, err
	}
	if t.Status == StatusClosed {
		return Ticket{}, ErrTicketClosed
	}
	next := t.Status
	if next == StatusOpen {
		next = StatusUnderReview
	}
	if _, err := pool.Exec(ctx,
		`UPDATE "SupportTicket" SET "assignee" = $2, "status" = $3, "updatedAt" = $4 WHERE "id" = $1`,
		id, staffID, next, now); err != nil {
		return Ticket{}, err
	}
	return GetTicket(ctx, pool, id)
}

// UpdateTicket fait avancer un dossier (staff) : statut validé, portée
// révisée via staffNote ajoutée (jamais écrasée), réponse éventuelle.
// Clore exige un closer différent de l'ouvreur (conflit d'intérêts refusé) ;
// clore ne lève ni suspension ni permission (aucun acte ici — les actes
// passent par les chemins existants).
func UpdateTicket(ctx context.Context, pool DB, id, staffID, status, staffNote, reply string, now time.Time) (Ticket, error) {
	if pool == nil {
		return Ticket{}, errors.New("base indisponible")
	}
	now = now.UTC()
	t, err := GetTicket(ctx, pool, id)
	if err != nil {
		return Ticket{}, err
	}
	if t.Status == StatusClosed {
		return Ticket{}, ErrTicketClosed
	}
	next := t.Status
	if status != "" {
		if !ValidTransition(t.Status, status) {
			return Ticket{}, fmt.Errorf("%w : transition %s → %s interdite", ErrInvalidTicket, t.Status, status)
		}
		next = status
	}
	if next == StatusClosed && t.OpenedBy == staffID {
		return Ticket{}, fmt.Errorf("%w : on ne clôt jamais son propre dossier", ErrInvalidTicket)
	}
	note := t.StaffNote
	if s := strings.TrimSpace(staffNote); s != "" {
		entry := "[" + now.Format(time.RFC3339) + " " + staffID + "] " + s
		if note == "" {
			note = entry
		} else {
			note += "\n" + entry
		}
	}
	var closedBy *string
	var closedAt *time.Time
	if next == StatusClosed {
		closedBy = &staffID
		closedAt = &now
	}
	if _, err := pool.Exec(ctx, `
		UPDATE "SupportTicket" SET "status" = $2, "staffNote" = $3,
		       "closedBy" = $4, "closedAt" = $5, "updatedAt" = $6
		WHERE "id" = $1`,
		id, next, note, closedBy, closedAt, now); err != nil {
		return Ticket{}, err
	}
	if r := strings.TrimSpace(reply); r != "" {
		if _, err := pool.Exec(ctx,
			`INSERT INTO "SupportMessage" ("id", "ticketId", "authorId", "body", "createdAt")
			 VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`, id, staffID, r, now); err != nil {
			return Ticket{}, err
		}
	}
	return GetTicket(ctx, pool, id)
}

// Metrics agrège la charge (tableau de bord staff) : compteurs par statut et
// kind (ouverts), plus ancien dossier ouvert (âge), délai moyen de clôture
// sur 30 j. Lecture seule.
type Metrics struct {
	Open           int            `json:"open"`
	UnderReview    int            `json:"under_review"`
	OpenByKind     map[string]int `json:"openByKind"`
	UnassignedOpen int            `json:"unassignedOpen"`
	OldestOpenAgeH float64        `json:"oldestOpenAgeHours"`
	AvgCloseHours  float64        `json:"avgCloseHours30d"`
	Closed30d      int            `json:"closed30d"`
}

// ComputeMetrics calcule la charge (pool nil : zéros).
func ComputeMetrics(ctx context.Context, pool DB, now time.Time) (Metrics, error) {
	m := Metrics{OpenByKind: map[string]int{}}
	if pool == nil {
		return m, nil
	}
	now = now.UTC()
	rows, err := pool.Query(ctx, `
		SELECT "status", "kind", COUNT(*),
		       COUNT(*) FILTER (WHERE "assignee" IS NULL AND "status" IN ('open','under_review')),
		       COALESCE(MIN("createdAt") FILTER (WHERE "status" IN ('open','under_review')), $1)
		FROM "SupportTicket" GROUP BY "status", "kind"`, now)
	if err != nil {
		return m, err
	}
	oldest := now
	for rows.Next() {
		var status, kind string
		var n, unassigned int
		var min time.Time
		if err := rows.Scan(&status, &kind, &n, &unassigned, &min); err != nil {
			rows.Close()
			return m, err
		}
		if status == StatusOpen || status == StatusUnderReview {
			m.OpenByKind[kind] += n
			m.UnassignedOpen += unassigned
			if status == StatusOpen {
				m.Open += n
			} else {
				m.UnderReview += n
			}
			if min.Before(oldest) {
				oldest = min
			}
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return m, err
	}
	if m.Open+m.UnderReview > 0 {
		m.OldestOpenAgeH = now.Sub(oldest).Hours()
	}
	var avg *float64
	if err := pool.QueryRow(ctx, `
		SELECT AVG(EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 3600), COUNT(*)
		FROM "SupportTicket"
		WHERE "status" = 'closed' AND "closedAt" >= $1`, now.Add(-30*24*time.Hour)).Scan(&avg, &m.Closed30d); err != nil {
		return m, err
	}
	if avg != nil {
		m.AvgCloseHours = *avg
	}
	return m, nil
}
