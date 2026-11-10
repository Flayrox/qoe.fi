package admin

// ── Triage uniforme des files staff ────────────────────────────────────
// Chaque file garde sa machine à états et ses capacités. Ce fichier ne crée
// pas de table Task générique : il ajoute à chaque table de file les MÊMES
// champs de triage (assignation, priorité, échéance) et réunit les six files
// dans une vue agrégée, en lecture ET en écriture.
//
// L'état SLA est dérivé : une échéance dépassée sur un dossier encore ouvert
// est « breached ». Le stocker obligerait à le recalculer par balayage ; une
// valeur dérivée ne peut pas mentir.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	// errQueueUnknown : clé de file hors du registre fermé.
	errQueueUnknown = errors.New("file inconnue")
	// errInvalidTriage : priorité, échéance ou assignation invalide, ou
	// élément introuvable dans la file.
	errInvalidTriage = errors.New("triage invalide")
)

const (
	QueueReports   = "reports"
	QueueAppeals   = "appeals"
	QueueAbuse     = "abuse"
	QueueSupport   = "support"
	QueueImports   = "imports"
	QueueApprovals = "approvals"

	// slaDueSoonWindow : une échéance à moins de 24 h est « due_soon ».
	slaDueSoonWindow = 24 * time.Hour
	// queueEntryLimit borne la vue agrégée ; les écrans métier gardent leur
	// pagination propre.
	queueEntryLimit = 40
)

// WorkQueueItem est le compteur d'une file dans « Ma file ».
type WorkQueueItem struct {
	Key          string `json:"key"`
	Label        string `json:"label"`
	Href         string `json:"href"`
	Count        int    `json:"count"`
	AssignedToMe int    `json:"assignedToMe"`
	Breached     int    `json:"breached"`
}

// QueueTriageEntry est une ligne de file avec ses champs de triage.
type QueueTriageEntry struct {
	Queue        string  `json:"queue"`
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	AssignedTo   *string `json:"assignedTo"`
	AssignedName *string `json:"assignedName"`
	Priority     string  `json:"priority"`
	DueAt        *string `json:"dueAt"`
	SLADueAt     string  `json:"slaDueAt"`
	SLAState     string  `json:"slaState"`
	AssignedToMe bool    `json:"assignedToMe"`
	Href         string  `json:"href"`
}

// WorkQueueView est la réponse de GET /v1/admin/work-queue : les compteurs par
// file et les éléments ouverts, triés par priorité puis échéance.
type WorkQueueView struct {
	Items        []WorkQueueItem    `json:"items"`
	Entries      []QueueTriageEntry `json:"entries"`
	AssignedToMe int                `json:"assignedToMe"`
	Breached     int                `json:"breached"`
}

// queueDefinition décrit UNE file : sa table, son état ouvert, son libellé,
// l'expression qui matérialise son échéance SLA par défaut.
type queueDefinition struct {
	Key           string
	Label         string
	Href          string
	Table         string
	IDColumn      string
	Source        string // relation SQL alias q
	OpenPredicate string
	TitleExpr     string
	StatusExpr    string
	DueExpr       string
}

// abuseQueueSource matérialise le dossier anti-abus : le dernier verdict par
// sujet, non `allow`, non expiré — exactement la définition de
// abuse.ListOpenDecisions. Le triage vit sur ce verdict.
const abuseQueueSource = `(SELECT * FROM (
		SELECT DISTINCT ON ("subjectType", "subjectId") *
		FROM "RiskDecision"
		ORDER BY "subjectType", "subjectId", "createdAt" DESC, "decidedBy" DESC, "id" DESC
	) latest
	WHERE latest."result" <> 'allow'
	  AND (latest."expiresAt" IS NULL OR latest."expiresAt" > now())
) q`

// abuseOpenPredicate vérifie que la ligne EST le dossier ouvert du sujet :
// un verdict historique n'est pas triable, et le prédicat sert aussi
// d'UPDATE pour ne pas écrire sur une décision périmée.
const abuseOpenPredicate = `q."id" IN (
	SELECT l."id" FROM (
		SELECT DISTINCT ON ("subjectType", "subjectId") "id", "result", "expiresAt"
		FROM "RiskDecision"
		ORDER BY "subjectType", "subjectId", "createdAt" DESC, "decidedBy" DESC, "id" DESC
	) l
	WHERE l."result" <> 'allow' AND (l."expiresAt" IS NULL OR l."expiresAt" > now())
)`

// queueDefinitions est le registre FERMÉ des files triables, dans l'ordre
// d'affichage de « Ma file ».
var queueDefinitions = []queueDefinition{
	{
		Key: QueueReports, Label: "Signalements à traiter", Href: "/admin/reports",
		Table: `"ModerationReport"`, IDColumn: `"id"`, Source: `"ModerationReport" q`,
		OpenPredicate: `q."status" = 'pending'`,
		TitleExpr:     `q."targetType" || ' · ' || q."reason"`,
		StatusExpr:    `q."status"::text`,
		DueExpr:       `COALESCE(q."dueAt", q."createdAt" + interval '24 hours')`,
	},
	{
		Key: QueueAppeals, Label: "Recours à instruire", Href: "/admin/appeals",
		Table: `"Appeal"`, IDColumn: `"id"`, Source: `"Appeal" q`,
		OpenPredicate: `q."status" IN ('open', 'under_review')`,
		TitleExpr:     `q."subjectType" || ' · ' || q."subjectId"`,
		StatusExpr:    `q."status"::text`,
		DueExpr:       `COALESCE(q."dueAt", q."createdAt" + interval '72 hours')`,
	},
	{
		Key: QueueAbuse, Label: "Revue anti-abus", Href: "/admin/abuse",
		Table: `"RiskDecision"`, IDColumn: `"id"`, Source: abuseQueueSource,
		OpenPredicate: abuseOpenPredicate,
		TitleExpr:     `q."subjectType" || ' · ' || q."subjectId"`,
		StatusExpr:    `'open'`,
		DueExpr:       `COALESCE(q."dueAt", q."createdAt" + interval '24 hours')`,
	},
	{
		Key: QueueSupport, Label: "Dossiers support ouverts", Href: "/admin/support",
		Table: `"SupportTicket"`, IDColumn: `"id"`, Source: `"SupportTicket" q`,
		OpenPredicate: `q."status" IN ('open', 'under_review')`,
		TitleExpr:     `q."subject"`,
		StatusExpr:    `q."status"::text`,
		DueExpr:       `COALESCE(q."dueAt", q."createdAt" + interval '48 hours')`,
	},
	{
		Key: QueueImports, Label: "Imports en revue", Href: "/admin/imports",
		Table: `"SubscriberImportBatch"`, IDColumn: `"id"`, Source: `"SubscriberImportBatch" q`,
		OpenPredicate: `q."status" IN ('submitted', 'reviewing', 'needs_info')`,
		TitleExpr:     `'Import ' || q."publisherId"`,
		StatusExpr:    `q."status"::text`,
		DueExpr:       `COALESCE(q."dueAt", q."createdAt" + interval '72 hours')`,
	},
	{
		Key: QueueApprovals, Label: "Doubles validations en attente", Href: "/admin/approvals",
		Table: `"AdminApproval"`, IDColumn: `"id"`, Source: `"AdminApproval" q`,
		OpenPredicate: `q."status" = 'pending' AND q."expiresAt" > now()`,
		TitleExpr:     `q."act" || ' · ' || q."target"`,
		StatusExpr:    `q."status"::text`,
		DueExpr:       `COALESCE(q."dueAt", q."expiresAt")`,
	},
}

func queueDefinitionByKey(key string) (queueDefinition, bool) {
	for _, def := range queueDefinitions {
		if def.Key == key {
			return def, true
		}
	}
	return queueDefinition{}, false
}

// validPriority est le vocabulaire fermé, identique aux CHECK de la migration.
func validPriority(value string) bool {
	switch value {
	case "low", "normal", "high", "urgent":
		return true
	default:
		return false
	}
}

// QueueSLAState dérive l'état SLA : un dossier fermé est « closed », une
// échéance dépassée « breached », une échéance proche « due_soon », sinon
// « on_track ».
func QueueSLAState(due time.Time, open bool) string {
	now := time.Now().UTC()
	if !open {
		return "closed"
	}
	if due.Before(now) {
		return "breached"
	}
	if due.Before(now.Add(slaDueSoonWindow)) {
		return "due_soon"
	}
	return "on_track"
}

// listQueueEntries lit les éléments ouverts d'une file avec leur triage.
func (s *Service) listQueueEntries(ctx context.Context, def queueDefinition, viewerID string, limit int) ([]QueueTriageEntry, error) {
	if limit <= 0 || limit > queueEntryLimit*5 {
		limit = queueEntryLimit
	}
	sql := fmt.Sprintf(`
		SELECT q.%s::text, %s, %s,
		       q."assignedTo"::text,
		       COALESCE(u.name, u.username, u.email, ''),
		       q."priority", q."dueAt", %s,
		       COALESCE(q."assignedTo" = NULLIF($1::text, '')::uuid, false)
		  FROM %s
		  LEFT JOIN "User" u ON u."id" = q."assignedTo"
		 WHERE %s
		 ORDER BY CASE q."priority" WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
		          %s ASC
		 LIMIT $2`,
		def.IDColumn, def.TitleExpr, def.StatusExpr, def.DueExpr, def.Source, def.OpenPredicate, def.DueExpr)

	rows, err := s.pool.Query(ctx, sql, viewerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]QueueTriageEntry, 0, limit)
	for rows.Next() {
		entry, err := scanQueueEntry(rows, def)
		if err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}

// scanQueueEntry partage le décodage entre la liste et la relecture unitaire.
type queueRowScanner interface {
	Scan(dest ...any) error
}

func scanQueueEntry(row queueRowScanner, def queueDefinition) (QueueTriageEntry, error) {
	var (
		entry        QueueTriageEntry
		assignedTo   *string
		assignedName *string
		dueAt        *time.Time
		slaDue       time.Time
		assignedMe   bool
	)
	if err := row.Scan(
		&entry.ID, &entry.Title, &entry.Status,
		&assignedTo, &assignedName,
		&entry.Priority, &dueAt, &slaDue, &assignedMe,
	); err != nil {
		return QueueTriageEntry{}, err
	}
	entry.Queue = def.Key
	entry.Href = def.Href
	entry.AssignedTo = assignedTo
	if assignedName != nil && strings.TrimSpace(*assignedName) == "" {
		assignedName = nil
	}
	entry.AssignedName = assignedName
	if dueAt != nil {
		formatted := dueAt.UTC().Format(time.RFC3339)
		entry.DueAt = &formatted
	}
	entry.SLADueAt = slaDue.UTC().Format(time.RFC3339)
	entry.SLAState = QueueSLAState(slaDue, true)
	entry.AssignedToMe = assignedMe
	return entry, nil
}

// queueEntryByID relit un élément ouvert : sert à renvoyer l'état exact après
// une écriture, sans que l'interface ait à le reconstruire.
func (s *Service) queueEntryByID(ctx context.Context, def queueDefinition, id, viewerID string) (QueueTriageEntry, error) {
	sql := fmt.Sprintf(`
		SELECT q.%s::text, %s, %s,
		       q."assignedTo"::text,
		       COALESCE(u.name, u.username, u.email, ''),
		       q."priority", q."dueAt", %s,
		       COALESCE(q."assignedTo" = NULLIF($1::text, '')::uuid, false)
		  FROM %s
		  LEFT JOIN "User" u ON u."id" = q."assignedTo"
		 WHERE %s AND q.%s = $2`,
		def.IDColumn, def.TitleExpr, def.StatusExpr, def.DueExpr, def.Source, def.OpenPredicate, def.IDColumn)
	entry, err := scanQueueEntry(s.pool.QueryRow(ctx, sql, viewerID, id), def)
	if errors.Is(err, pgx.ErrNoRows) {
		return QueueTriageEntry{}, errInvalidTriage
	}
	return entry, err
}

// queueCounts calcule les trois compteurs d'une file : ouverts, assignés à la
// personne, échéance dépassée.
func (s *Service) queueCounts(ctx context.Context, def queueDefinition, viewerID string) (WorkQueueItem, error) {
	item := WorkQueueItem{Key: def.Key, Label: def.Label, Href: def.Href}
	sql := fmt.Sprintf(`
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE q."assignedTo" = NULLIF($1::text, '')::uuid),
		       COUNT(*) FILTER (WHERE %s < now())
		  FROM %s
		 WHERE %s`, def.DueExpr, def.Source, def.OpenPredicate)
	if err := s.pool.QueryRow(ctx, sql, viewerID).Scan(&item.Count, &item.AssignedToMe, &item.Breached); err != nil {
		return item, err
	}
	return item, nil
}

// GetWorkQueue réunit les six files triables. `viewerID` sert uniquement à
// marquer « assigné à moi » : la capacité d'écran (dashboard.read) est vérifiée
// par la route.
func (s *Service) GetWorkQueue(ctx context.Context, viewerID string) (WorkQueueView, error) {
	view := WorkQueueView{
		Items:   make([]WorkQueueItem, 0, len(queueDefinitions)),
		Entries: make([]QueueTriageEntry, 0, len(queueDefinitions)*4),
	}
	for _, def := range queueDefinitions {
		item, err := s.queueCounts(ctx, def, viewerID)
		if err != nil {
			return WorkQueueView{}, err
		}
		entries, err := s.listQueueEntries(ctx, def, viewerID, queueEntryLimit)
		if err != nil {
			return WorkQueueView{}, err
		}
		view.Items = append(view.Items, item)
		view.Entries = append(view.Entries, entries...)
		view.AssignedToMe += item.AssignedToMe
		view.Breached += item.Breached
	}
	return view, nil
}

// TriageUpdate porte une écriture de triage. Un champ absent (nil) est
// INCHANGÉ ; une chaîne vide efface l'assignation ou l'échéance explicite.
type TriageUpdate struct {
	AssignedTo *string `json:"assignedTo"`
	Priority   *string `json:"priority"`
	DueAt      *string `json:"dueAt"`
}

// UpdateQueueTriage persiste le triage d'un élément de file et écrit TOUJOURS
// une entrée d'audit, même si le flag admin-audit-log est désactivé.
func (s *Service) UpdateQueueTriage(ctx context.Context, staffID, queue, id string, in TriageUpdate) (QueueTriageEntry, error) {
	def, ok := queueDefinitionByKey(queue)
	if !ok {
		return QueueTriageEntry{}, errQueueUnknown
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return QueueTriageEntry{}, errInvalidTriage
	}

	hasAssignee := in.AssignedTo != nil
	assignee := ""
	if hasAssignee {
		assignee = strings.TrimSpace(*in.AssignedTo)
		if assignee != "" {
			var exists bool
			if err := s.pool.QueryRow(ctx,
				`SELECT EXISTS(SELECT 1 FROM "User" WHERE id = $1)`, assignee).Scan(&exists); err != nil {
				return QueueTriageEntry{}, err
			}
			if !exists {
				return QueueTriageEntry{}, fmt.Errorf("%w: personne inconnue", errInvalidTriage)
			}
		}
	}

	hasPriority := in.Priority != nil
	priority := ""
	if hasPriority {
		priority = strings.TrimSpace(*in.Priority)
		if !validPriority(priority) {
			return QueueTriageEntry{}, fmt.Errorf("%w: priorité hors vocabulaire", errInvalidTriage)
		}
	}

	hasDue := in.DueAt != nil
	due := ""
	if hasDue {
		due = strings.TrimSpace(*in.DueAt)
		if due != "" {
			if _, err := time.Parse(time.RFC3339, due); err != nil {
				return QueueTriageEntry{}, fmt.Errorf("%w: échéance invalide", errInvalidTriage)
			}
		}
	}

	// L'écriture ne touche QUE le triage : le statut métier reste la
	// propriété de la machine à états de la file.
	sql := fmt.Sprintf(`
		UPDATE %s AS q SET
		    "assignedTo" = CASE WHEN $2 THEN NULLIF($3::text, '')::uuid ELSE "assignedTo" END,
		    "priority" = CASE WHEN $4 THEN $5::text ELSE "priority" END,
		    "dueAt" = CASE WHEN $6 THEN NULLIF($7::text, '')::timestamptz ELSE "dueAt" END,
		    "triageUpdatedAt" = now(),
		    "triageUpdatedBy" = NULLIF($1::text, '')::uuid
		 WHERE %s = $8 AND (%s)`, def.Table, def.IDColumn, def.OpenPredicate)
	tag, err := s.pool.Exec(ctx, sql, staffID, hasAssignee, assignee, hasPriority, priority, hasDue, due, id)
	if err != nil {
		return QueueTriageEntry{}, err
	}
	if tag.RowsAffected() == 0 {
		return QueueTriageEntry{}, fmt.Errorf("%w: élément introuvable ou fermé", errInvalidTriage)
	}

	entry, err := s.queueEntryByID(ctx, def, id, staffID)
	if err != nil {
		return QueueTriageEntry{}, err
	}
	s.logAudit(ctx, staffID, "queue.triage", queue, id, map[string]any{
		"assignedTo": entry.AssignedTo,
		"priority":   entry.Priority,
		"dueAt":      entry.DueAt,
		"slaState":   entry.SLAState,
	})
	return entry, nil
}
