// Package media — gestion des Médias (organisations) côté créateur.
// Migration de apps/studio/src/app/(creator)/media/actions.ts + page.tsx vers Go.
// Les DTO imitent les shapes Prisma consommées par MediaStudioClient.
package media

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/auditlog"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/flags"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/shared/identifier"
)

const (
	// MaxActiveMediaApiKeys est la limite maximale de clés API actives par média.
	MaxActiveMediaApiKeys = 10
)

var (
	errForbidden     = errors.New("accès refusé")
	errNotFound      = errors.New("introuvable")
	errAlreadyMember = errors.New("déjà membre actif de ce média")
	ErrInvalidScopes = errors.New("scopes invalides")
)

// Service porte les opérations média du créateur.
type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries

	// flags est conservé pour le futur mode verbeux de l'audit ; la trace
	// AdminAuditLog n'est plus conditionnée par admin-audit-log.
	flags *flags.Service
	asynq *asynq.Client
}

// SetAsynqClient branche le client asynq pour les alertes de sécurité.
func (s *Service) SetAsynqClient(c *asynq.Client) { s.asynq = c }

// recordApiKeySecurityEvent journalise la vie d'une clé API média. Chaque échec
// est tracé : un insert raté laissait le journal de sécurité vide sans trace.
// `metadata` est toujours un objet JSON (colonne NOT NULL).
func (s *Service) recordApiKeySecurityEvent(ctx context.Context, userID, publisherID, keyID, eventType string, meta map[string]any) {
	if s.pool == nil || userID == "" {
		return
	}
	if meta == nil {
		meta = map[string]any{}
	}
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		log.Printf("[media] security event %s: marshal: %v", eventType, err)
		metaBytes = []byte("{}")
	}
	if _, err := db.New(s.pool).InsertSecurityEvent(ctx, db.InsertSecurityEventParams{
		UserId:      toUUID(userID),
		PublisherId: pgtype.Text{String: publisherID, Valid: publisherID != ""},
		ApiKeyId:    pgtype.Text{String: keyID, Valid: keyID != ""},
		EventType:   eventType,
		Metadata:    metaBytes,
	}); err != nil {
		log.Printf("[media] security event %s (%s): insert: %v", eventType, userID, err)
	}
	var email string
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(email, '') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&email); err != nil {
		log.Printf("[media] security event %s (%s): email: %v", eventType, userID, err)
		return
	}
	if email != "" {
		if err := queue.PublishSecurityAlertEmail(s.asynq, queue.SecurityAlertEmailPayload{
			UserID:    userID,
			Email:     email,
			EventType: eventType,
			Occurred:  time.Now().UTC().Format(time.RFC3339),
		}); err != nil {
			log.Printf("[media] security event %s (%s): alerte: %v", eventType, userID, err)
		}
	}
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// SetFlags branche le service feature flags (journal d'audit admin).
func (s *Service) SetFlags(f *flags.Service) {
	s.flags = f
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func textFromString(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func timestampPtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	v := t.Time.Format(time.RFC3339)
	return &v
}

// validRoles est l'allowlist des rôles média (parité MEDIA_ROLES de @qoe/auth).
var validRoles = map[string]bool{"owner": true, "editor": true, "writer": true, "viewer": true}

// member retourne la membership de userID dans mediaID (nil si absent).
func (s *Service) member(ctx context.Context, mediaID, userID string) (*db.GetMediaMemberByIDRow, error) {
	row, err := s.q.GetMediaMemberByID(ctx, db.GetMediaMemberByIDParams{
		MediaId: mediaID, UserId: toUUID(userID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// authorizeMedia vérifie que l'utilisateur est membre du média ; si permission
// est non vide, exige la permission (media:manage_members / manage_settings…).
func (s *Service) authorizeMedia(ctx context.Context, mediaID, userID, permission string) (*db.GetMediaMemberByIDRow, error) {
	m, err := s.member(ctx, mediaID, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errForbidden
	}
	if permission != "" && !permissions.CanMedia(&permissions.MediaMember{
		Role: m.Role, Permissions: m.Permissions, Status: m.Status,
	}, permission) {
		return nil, errForbidden
	}
	return m, nil
}

// audit écrit le journal d'activité du média. Un échec ne doit pas être muet :
// le journal est la seule trace de « qui a changé quoi » dans l'équipe.
func (s *Service) audit(ctx context.Context, mediaID, actorID, action string, metadata any) {
	raw, err := json.Marshal(metadata)
	if err != nil {
		log.Printf("[media] audit %s: marshal: %v", action, err)
		raw = []byte("{}")
	}
	if err := s.q.InsertMediaAuditLog(ctx, db.InsertMediaAuditLogParams{
		MediaId: mediaID, ActorId: toUUID(actorID), Action: action, Metadata: string(raw),
	}); err != nil {
		log.Printf("[media] audit %s (média %s): %v", action, mediaID, err)
	}
}

// ── Workspaces (parité getUserWorkspacesAction) ─────────────────────────────

// WorkspaceDTO est un workspace listé (profil personnel OU média).
type WorkspaceDTO struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Slug    string  `json:"slug"`
	LogoURL *string `json:"logoUrl"`
	Type    string  `json:"type"`
	Role    *string `json:"role,omitempty"`
}

// ListWorkspaces retourne le profil personnel + les médias de l'utilisateur.
func (s *Service) ListWorkspaces(ctx context.Context, userID string) (map[string]any, error) {
	identity, err := s.q.GetUserIdentity(ctx, userID)
	if err != nil {
		return nil, err
	}

	personal := WorkspaceDTO{ID: userID, Type: "PERSONAL"}
	if name := textPtr(identity.Name); name != nil {
		personal.Name = *name
	} else if uname := textPtr(identity.Username); uname != nil {
		personal.Name = *uname
	} else {
		personal.Name = "Profil Personnel"
	}
	if uname := textPtr(identity.Username); uname != nil {
		personal.Slug = *uname
	} else {
		personal.Slug = "personal"
	}
	personal.LogoURL = textPtr(identity.LogoUrl)

	// Publication personnelle existante → id/slug officiels. Une erreur autre
	// que « pas encore de publication » doit remonter : sinon le workspace
	// personnel annonce l'id utilisateur comme id de publication et le studio
	// adresse ensuite les endpoints média avec un identifiant faux.
	pub, err := s.q.GetPersonalPublisherForUser(ctx, userID)
	switch {
	case err == nil:
		personal.ID = pub.ID
		personal.Name = pub.Name
		personal.Slug = pub.Slug
		personal.LogoURL = textPtr(pub.LogoUrl)
	case !errors.Is(err, pgx.ErrNoRows):
		return nil, err
	}

	rows, err := s.q.GetUserMediaMemberships(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	medias := make([]WorkspaceDTO, 0, len(rows))
	for _, r := range rows {
		role := r.Role
		medias = append(medias, WorkspaceDTO{
			ID: r.MediaID, Name: r.PublisherName, Slug: r.PublisherSlug,
			LogoURL: textPtr(r.PublisherLogo), Type: "MEDIA", Role: &role,
		})
	}
	return map[string]any{"personal": personal, "medias": medias}, nil
}

// ── Liste (parité media/page.tsx) ───────────────────────────────────────────

// MediaListItem est un média de la liste de l'utilisateur (avec compteurs).
type MediaListItem struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Subdomain    *string `json:"subdomain"`
	Bio          *string `json:"bio"`
	LogoURL      *string `json:"logoUrl"`
	Role         string  `json:"role"`
	MembersCount int32   `json:"membersCount"`
}

// ListMedia retourne les médias dont l'utilisateur est membre.
func (s *Service) ListMedia(ctx context.Context, userID string) ([]MediaListItem, error) {
	rows, err := s.q.GetUserMediaMemberships(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	// Compteurs de membres en une requête agrégée (avant : un COUNT par média,
	// erreur avalée → le studio affichait « 0 membre » sur une base en panne).
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.MediaID)
	}
	counts := map[string]int32{}
	if len(ids) > 0 {
		crow, err := s.pool.Query(ctx, `
			SELECT "mediaId", COUNT(*)::int AS n
			FROM "MediaMember" WHERE "mediaId" = ANY($1::text[])
			GROUP BY "mediaId"`, ids)
		if err != nil {
			return nil, err
		}
		for crow.Next() {
			var id string
			var n int32
			if err := crow.Scan(&id, &n); err != nil {
				crow.Close()
				return nil, err
			}
			counts[id] = n
		}
		if err := crow.Err(); err != nil {
			crow.Close()
			return nil, err
		}
		crow.Close()
	}
	items := make([]MediaListItem, 0, len(rows))
	for _, r := range rows {
		members := counts[r.MediaID]
		items = append(items, MediaListItem{
			ID:           r.MediaID,
			Name:         r.PublisherName,
			Slug:         r.PublisherSlug,
			Subdomain:    textPtr(r.PublisherSubdomain),
			Bio:          textPtr(r.PublisherBio),
			LogoURL:      textPtr(r.PublisherLogo),
			Role:         r.Role,
			MembersCount: members,
		})
	}
	return items, nil
}

// ── Détail (parité getMediaByIdAction — shapes Prisma) ──────────────────────

// MediaPublication est la publication d'un média (détail studio).
type MediaPublisher struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Slug           string     `json:"slug"`
	Subdomain      *string    `json:"subdomain"`
	CustomDomain   *string    `json:"customDomain"`
	Bio            *string    `json:"bio"`
	LogoURL        *string    `json:"logoUrl"`
	HeroText       *string    `json:"heroText"`
	HeaderImageURL *string    `json:"headerImageUrl"`
	FooterText     *string    `json:"footerText"`
	AccentColor    *string    `json:"accentColor"`
	ThemeMode      *string    `json:"themeMode"`
	LayoutStyle    *string    `json:"layoutStyle"`
	SeoTitle       *string    `json:"seoTitle"`
	SeoDescription *string    `json:"seoDescription"`
	AllowIndexing  bool       `json:"allowIndexing"`
	SupportURL     *string    `json:"supportUrl"`
	FontFamily     *string    `json:"fontFamily"`
	Count          MediaCount `json:"_count"`
}

// MediaCount est le compteur _count de la publication.
type MediaCount struct {
	Articles int32 `json:"articles"`
}

// MediaMemberUser est l'utilisateur d'un membre (détail studio).
type MediaMemberUser struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
}

// MediaMemberDTO est un membre listé dans le détail d'un média.
type MediaMemberDTO struct {
	ID          string          `json:"id"`
	Role        string          `json:"role"`
	Permissions []string        `json:"permissions"`
	Status      string          `json:"status"`
	JoinedAt    string          `json:"joinedAt"`
	User        MediaMemberUser `json:"user"`
}

// MediaInviter est l'inviteur d'une invitation (détail studio).
type MediaInviter struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl,omitempty"`
}

// MediaDetail est le média complet (parité include Prisma de getMediaByIdAction).
type MediaDetail struct {
	ID        string           `json:"id"`
	Publisher MediaPublisher   `json:"publisher"`
	Members   []MediaMemberDTO `json:"members"`
}

func (s *Service) mediaDetail(ctx context.Context, mediaID string, row db.GetMediaWithPublisherRow) (MediaDetail, error) {
	articles, err := s.q.CountArticlesByPublisher(ctx, row.PublisherID)
	if err != nil {
		return MediaDetail{}, err
	}
	members, err := s.q.ListMediaMembers(ctx, mediaID)
	if err != nil {
		return MediaDetail{}, err
	}
	detail := MediaDetail{
		ID: row.MediaID,
		Publisher: MediaPublisher{
			ID:             row.PublisherID,
			Name:           row.Name,
			Slug:           row.Slug,
			Subdomain:      textPtr(row.Subdomain),
			CustomDomain:   textPtr(row.CustomDomain),
			Bio:            textPtr(row.Bio),
			LogoURL:        textPtr(row.LogoUrl),
			HeroText:       textPtr(row.HeroText),
			HeaderImageURL: textPtr(row.HeaderImageUrl),
			FooterText:     textPtr(row.FooterText),
			AccentColor:    textPtr(row.AccentColor),
			ThemeMode:      textPtr(row.ThemeMode),
			LayoutStyle:    textPtr(row.LayoutStyle),
			SeoTitle:       textPtr(row.SeoTitle),
			SeoDescription: textPtr(row.SeoDescription),
			AllowIndexing:  row.AllowIndexing,
			SupportURL:     textPtr(row.SupportUrl),
			FontFamily:     textPtr(row.FontFamily),
			Count:          MediaCount{Articles: articles},
		},
		Members: make([]MediaMemberDTO, 0, len(members)),
	}
	for _, m := range members {
		detail.Members = append(detail.Members, MediaMemberDTO{
			ID: m.MemberID, Role: m.Role, Permissions: m.Permissions, Status: m.Status,
			JoinedAt: m.JoinedAt.Time.Format(time.RFC3339),
			User: MediaMemberUser{
				ID: m.UserID, Name: textPtr(m.Name), Username: textPtr(m.Username),
				LogoURL: textPtr(m.LogoUrl),
			},
		})
	}
	return detail, nil
}

// MediaAuditActor est l'auteur d'une entrée du journal média.
type MediaAuditActor struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
}

// MediaAuditEntry est une entrée du journal d'activité du média.
type MediaAuditEntry struct {
	ID        string           `json:"id"`
	Action    string           `json:"action"`
	Metadata  map[string]any   `json:"metadata"`
	CreatedAt string           `json:"createdAt"`
	Actor     *MediaAuditActor `json:"actor"`
}

// AuditLogFilter borne et filtre le journal d'activité. Category est une
// famille d'actions (articles, team, settings, invitations, api) ; Query
// cherche dans l'action, l'acteur et les métadonnées.
type AuditLogFilter struct {
	Limit    int
	Offset   int
	Category string
	Query    string
}

// maxAuditOffset borne la pagination profonde du journal d'activité.
const maxAuditOffset = 10_000

// MediaAuditPage est une page du journal avec le total filtré, pour que l'UI
// puisse afficher « 20 sur 143 » et proposer un chargement supplémentaire.
type MediaAuditPage struct {
	Entries []MediaAuditEntry `json:"entries"`
	Total   int               `json:"total"`
	Limit   int               `json:"limit"`
	Offset  int               `json:"offset"`
}

// auditActionPrefix traduit une famille d'activité en préfixe SQL.
func auditActionPrefix(category string) string {
	switch category {
	case "articles":
		return "media.article_%"
	case "team":
		return "member.%"
	case "settings":
		return "media.settings_%"
	case "invitations":
		return "media.invite_%"
	case "api":
		return "api_key.%"
	default:
		return ""
	}
}

// ListAuditLog retourne le journal d'activité du média (réglages, équipe,
// articles et transferts). Réservé aux rôles qui administrent le média ou
// éditent tous ses articles : un éditeur doit pouvoir voir qui a changé quoi
// sur les contenus qu'il peut lui-même modifier.
func (s *Service) ListAuditLog(ctx context.Context, userID, mediaID string, filter AuditLogFilter) (MediaAuditPage, error) {
	m, err := s.authorizeMedia(ctx, mediaID, userID, "")
	if err != nil {
		return MediaAuditPage{}, err
	}
	member := &permissions.MediaMember{Role: m.Role, Permissions: m.Permissions, Status: m.Status}
	if !permissions.CanMedia(member, permissions.PermManageSettings) &&
		!permissions.CanMedia(member, permissions.PermManageMembers) &&
		!permissions.CanMedia(member, permissions.PermEditAny) {
		return MediaAuditPage{}, errForbidden
	}
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	// Pagination profonde et motif de recherche bornés : `q` alimente un ILIKE
	// `%…%` sur trois colonnes, un motif de 100 000 caractères ou un offset
	// arbitraire rendait la requête coûteuse pour tous les membres.
	if filter.Offset > maxAuditOffset {
		filter.Offset = maxAuditOffset
	}
	if runes := []rune(filter.Query); len(runes) > 80 {
		filter.Query = string(runes[:80])
	}
	prefix := auditActionPrefix(filter.Category)

	total, err := s.q.CountMediaAuditLogs(ctx, db.CountMediaAuditLogsParams{
		MediaId: mediaID, ActionPrefix: prefix, Query: filter.Query,
	})
	if err != nil {
		return MediaAuditPage{}, err
	}

	rows, err := s.q.ListMediaAuditLogs(ctx, db.ListMediaAuditLogsParams{
		MediaId: mediaID, ActionPrefix: prefix, Query: filter.Query,
		Limit: int32(filter.Limit), Offset: int32(filter.Offset),
	})
	if err != nil {
		return MediaAuditPage{}, err
	}
	entries := make([]MediaAuditEntry, 0, len(rows))
	for _, row := range rows {
		entry := MediaAuditEntry{
			ID:        row.ID,
			Action:    row.Action,
			Metadata:  map[string]any{},
			CreatedAt: row.CreatedAt.Time.Format(time.RFC3339),
		}
		// sqlc type la colonne jsonb en interface{} : accepter le texte comme
		// les octets selon le driver, sans jamais faire échouer la lecture du
		// journal pour une entrée mal formée.
		switch raw := row.Metadata.(type) {
		case string:
			_ = json.Unmarshal([]byte(raw), &entry.Metadata)
		case []byte:
			_ = json.Unmarshal(raw, &entry.Metadata)
		case map[string]any:
			entry.Metadata = raw
		}
		entry.Actor = &MediaAuditActor{
			ID:       row.ActorID,
			Name:     textPtr(row.ActorName),
			Username: textPtr(row.ActorUsername),
			LogoURL:  textPtr(row.ActorLogo),
		}
		entries = append(entries, entry)
	}
	return MediaAuditPage{
		Entries: entries, Total: int(total), Limit: filter.Limit, Offset: filter.Offset,
	}, nil
}

// GetMedia retourne le détail complet d'un média (membre requis).
func (s *Service) GetMedia(ctx context.Context, userID, mediaID string) (MediaDetail, string, error) {
	m, err := s.authorizeMedia(ctx, mediaID, userID, "")
	if err != nil {
		return MediaDetail{}, "", err
	}
	row, err := s.q.GetMediaWithPublisher(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MediaDetail{}, "", errNotFound
		}
		return MediaDetail{}, "", err
	}
	detail, err := s.mediaDetail(ctx, mediaID, row)
	if err != nil {
		return MediaDetail{}, "", err
	}
	return detail, m.Role, nil
}

// ── Création (parité createMediaAction) ─────────────────────────────────────

// sanitizeText borne et assainit un texte saisi (0 maxRunes = pas de minimum).
func sanitizeText(value string, maxRunes int, allowNewlines bool) (string, error) {
	return antispam.SanitizeAndValidateText(value, 0, maxRunes, antispam.TextOptions{
		AllowNewlines: allowNewlines,
		CheckXSS:      true,
	})
}

// validateMediaSlug valide le permalien d'un média, qui devient aussi son
// sous-domaine : même syntaxe que les sous-domaines de publication.
func validateMediaSlug(slug string) (string, string) {
	clean := cleanSlug(slug)
	if clean == "" {
		return "", "Le nom et le permalien du Média sont requis"
	}
	if len(clean) < 3 || len(clean) > 30 {
		return "", "Le permalien doit contenir entre 3 et 30 caractères."
	}
	if identifier.IsReserved(clean) {
		return "", "Ce permalien est réservé par la plateforme."
	}
	return clean, ""
}

// CreateMedia crée Publication (MEDIA) + Media + membre owner + audit (transaction).
func (s *Service) CreateMedia(ctx context.Context, userID, name, slug, bio, logoURL string) (map[string]string, error) {
	if userID == "" {
		return nil, errUnauthenticated
	}
	cleanName, err := sanitizeText(strings.TrimSpace(name), 120, false)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(cleanName) == "" {
		return nil, invalid("Le nom et le permalien du Média sont requis")
	}
	name = cleanName
	clean, reason := validateMediaSlug(slug)
	if reason != "" {
		return nil, invalid("%s", reason)
	}
	if bio != "" {
		cleaned, err := sanitizeText(bio, 1000, true)
		if err != nil {
			return nil, err
		}
		bio = cleaned
	}
	if strings.TrimSpace(logoURL) != "" {
		if err := antispam.ValidateSafeURL(logoURL); err != nil {
			return nil, err
		}
	} else {
		logoURL = ""
	}

	exists, err := s.q.CheckMediaSlugExists(ctx, clean)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, invalid("Ce permalien de Média est déjà utilisé par un autre journal")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	pubID, err := tq.CreateMediaPublisher(ctx, db.CreateMediaPublisherParams{
		Name: name, Slug: clean, Subdomain: textFromString(clean),
		Bio: textFromString(bio), LogoUrl: textFromString(logoURL), AccentColor: textFromString("#EE4B2B"),
	})
	if err != nil {
		// Course entre le check de disponibilité et l'INSERT, ou sous-domaine
		// pris entre-temps : la base tranche, le client recoit un 400 clair.
		if isUniqueViolation(err) {
			return nil, invalid("Ce permalien de Média est déjà utilisé par un autre journal")
		}
		return nil, err
	}
	mediaID, err := tq.CreateMedia(ctx, pubID)
	if err != nil {
		return nil, err
	}
	if err := tq.CreateMediaMember(ctx, db.CreateMediaMemberParams{
		MediaId: mediaID, UserId: toUUID(userID), Role: "owner", Status: "active",
	}); err != nil {
		return nil, err
	}
	if err := tq.InsertMediaAuditLog(ctx, db.InsertMediaAuditLogParams{
		MediaId: mediaID, ActorId: toUUID(userID), Action: "media.created",
		Metadata: string(mustJSON(map[string]string{"name": name, "slug": clean})),
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]string{"id": mediaID, "publisherId": pubID}, nil
}

var slugCleaner = regexp.MustCompile(`[^a-z0-9]+`)

func cleanSlug(input string) string {
	s := strings.ToLower(strings.TrimSpace(input))
	s = slugCleaner.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func mustJSON(v any) []byte {
	raw, _ := json.Marshal(v)
	return raw
}

// ── Réglages (parité updateMediaSettingsAction) ─────────────────────────────

// mediaStringColumns est l'allowlist des colonnes Publication éditables (parité Prisma).
var mediaStringColumns = map[string]string{
	"name": "name", "bio": "bio", "logoUrl": "logoUrl", "subdomain": "subdomain",
	"customDomain": "customDomain", "accentColor": "accentColor", "heroText": "heroText",
	"headerImageUrl": "headerImageUrl", "footerText": "footerText", "themeMode": "themeMode",
	"layoutStyle": "layoutStyle", "seoTitle": "seoTitle", "seoDescription": "seoDescription",
	"fontFamily": "fontFamily", "supportUrl": "supportUrl",
}

// MediaIDByPublisher résout l'id d'un média depuis l'id de sa publication.
// Les profils publics n'exposent que la publisherId (profil média) — l'erreur
// du 19/09 venait de ces deux identifiants confondus par le front.
func (s *Service) MediaIDByPublisher(ctx context.Context, publisherID string) (string, error) {
	row, err := s.q.GetMediaByPublisherID(ctx, publisherID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errNotFound
		}
		return "", err
	}
	return row.MediaID, nil
}

// UpdateSettings applique une mise à jour partielle des réglages du média
// (identity, design, SEO) — RBAC media:manage_settings. Retourne la publication.
func (s *Service) UpdateSettings(ctx context.Context, userID, mediaID string, body map[string]any) (MediaPublisher, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageSettings); err != nil {
		return MediaPublisher{}, err
	}

	row, err := s.q.GetMediaWithPublisher(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MediaPublisher{}, errNotFound
		}
		return MediaPublisher{}, err
	}

	fields := map[string]any{}
	for key, col := range mediaStringColumns {
		v, ok := body[key]
		if !ok {
			continue
		}
		if v == nil {
			fields[col] = nil
			continue
		}
		str, ok := v.(string)
		if !ok {
			return MediaPublisher{}, invalid("champ invalide: %s", key)
		}
		cleaned, err := s.validateSettingsField(ctx, row.PublisherID, key, str)
		if err != nil {
			return MediaPublisher{}, err
		}
		fields[col] = cleaned
	}
	if v, ok := body["allowIndexing"]; ok {
		b, ok := v.(bool)
		if !ok {
			return MediaPublisher{}, invalid("allowIndexing doit être un booléen")
		}
		fields["allowIndexing"] = b
	}
	if v, ok := body["siteOptions"]; ok {
		if v == nil {
			fields["siteOptions"] = []byte("{}")
		} else {
			raw, err := json.Marshal(v)
			if err != nil {
				return MediaPublisher{}, invalid("siteOptions JSON invalide")
			}
			fields["siteOptions"] = raw
		}
	}

	if len(fields) > 0 {
		if err := s.updatePublisher(ctx, row.PublisherID, fields); err != nil {
			// Sous-domaine pris entre-temps : la base tranche, 400 clair.
			if isUniqueViolation(err) {
				return MediaPublisher{}, invalid("Ce sous-domaine est déjà attribué à une autre publication.")
			}
			return MediaPublisher{}, err
		}
	}

	keys := make([]string, 0, len(body))
	for k := range body {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	s.audit(ctx, mediaID, userID, "media.settings_updated", map[string]any{"fields": keys})

	updated, err := s.q.GetMediaWithPublisher(ctx, mediaID)
	if err != nil {
		return MediaPublisher{}, err
	}
	detail, err := s.mediaDetail(ctx, mediaID, updated)
	if err != nil {
		return MediaPublisher{}, err
	}
	return detail.Publisher, nil
}

// updatePublication construit un UPDATE dynamique limité à un allowlist de colonnes.
func (s *Service) updatePublisher(ctx context.Context, publisherID string, fields map[string]any) error {
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	sets := make([]string, 0, len(keys))
	args := make([]any, 0, len(keys)+1)
	args = append(args, publisherID)
	for _, k := range keys {
		sets = append(sets, `"`+k+`" = $`+strconv.Itoa(len(args)+1))
		args = append(args, fields[k])
	}
	query := `UPDATE "Publisher" SET ` + strings.Join(sets, ", ") + `, "updatedAt" = now() WHERE id = $1`
	_, err := s.pool.Exec(ctx, query, args...)
	return err
}

var (
	accentColorPattern  = regexp.MustCompile(`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`)
	customDomainPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`)
)

// validateSettingsField borne et valide un champ texte des réglages média.
// Avant, `UpdateSettings` écrivait la valeur brute : un `seoTitle` de 50 000
// caractères, un `logoUrl` `javascript:` (lien cliquable sur le site public),
// un `bio` avec balises, ou n'importe quel `subdomain` — y compris celui d'une
// autre publication (500 sur l'index d'unicité).
func (s *Service) validateSettingsField(ctx context.Context, publisherID, key, value string) (string, error) {
	switch key {
	case "name":
		cleaned, err := sanitizeText(strings.TrimSpace(value), 120, false)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(cleaned) == "" {
			return "", invalid("Le nom du Média est requis")
		}
		return cleaned, nil
	case "bio", "heroText", "footerText", "seoDescription":
		return sanitizeText(value, 1000, true)
	case "seoTitle":
		return sanitizeText(value, 200, false)
	case "logoUrl", "headerImageUrl", "supportUrl":
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return "", nil
		}
		if len([]rune(trimmed)) > 500 {
			return "", invalid("URL trop longue pour %s", key)
		}
		if err := antispam.ValidateSafeURL(trimmed); err != nil {
			return "", err
		}
		return trimmed, nil
	case "subdomain":
		if strings.TrimSpace(value) == "" {
			return "", nil
		}
		clean, reason := validateMediaSlug(value)
		if reason != "" {
			return "", invalid("%s", reason)
		}
		var taken bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM "Publisher" WHERE "subdomain" = $1 AND id <> $2)`,
			clean, publisherID).Scan(&taken); err != nil {
			return "", err
		}
		if taken {
			return "", invalid("Ce sous-domaine est déjà attribué à une autre publication.")
		}
		return clean, nil
	case "customDomain":
		clean := strings.ToLower(strings.TrimSpace(value))
		if clean == "" {
			return "", nil
		}
		if len(clean) > 253 || !customDomainPattern.MatchString(clean) {
			return "", invalid("Domaine personnalisé invalide")
		}
		return clean, nil
	case "accentColor":
		clean := strings.TrimSpace(value)
		if clean == "" {
			return "", nil
		}
		if !accentColorPattern.MatchString(clean) {
			return "", invalid("Couleur d'accent invalide (format #RRGGBB)")
		}
		return clean, nil
	default:
		// layoutStyle, fontFamily, themeMode : libres mais bornés.
		return sanitizeText(value, 40, false)
	}
}

// isUniqueViolation reconnaît une violation de contrainte d'unicité (23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// MediaIDForMember résout l'id d'un média depuis une publication, à condition
// que l'appelant en soit membre. Sans ce contrôle, `GET
// /v1/media/by-publication/{publisherId}` laissait tout compte authentifié
// convertir un identifiant public de publication en identifiant interne de
// média (énumération).
func (s *Service) MediaIDForMember(ctx context.Context, userID, publisherID string) (string, error) {
	mediaID, err := s.MediaIDByPublisher(ctx, publisherID)
	if err != nil {
		return "", err
	}
	if _, err := s.authorizeMedia(ctx, mediaID, userID, ""); err != nil {
		return "", err
	}
	return mediaID, nil
}

// ── Membres (rôle / permissions / retrait) ──────────────────────────────────

// guardOwnerMutation refuse toute modification du propriétaire par un autre
// membre et tout octroi du rôle `owner`. Avant, un gestionnaire de membres
// pouvait rétrograder l'owner ou s'attribuer `owner` : contrôle total du média
// sans transfert de propriété.
func guardOwnerMutation(target *db.GetMediaMemberByIDRow, actorUserID, memberUserID, newRole string) error {
	if target == nil {
		return errNotFound
	}
	if newRole == "owner" && target.Role != "owner" {
		return policy("Le transfert de propriété n'est pas disponible depuis cette console.")
	}
	if target.Role == "owner" && memberUserID != actorUserID {
		return policy("Le propriétaire du Média ne peut pas être modifié par un autre membre.")
	}
	if target.Role == "owner" && newRole != "owner" {
		return policy("Le propriétaire doit d'abord transférer la propriété du Média.")
	}
	return nil
}

// UpdateMemberRole change le rôle d'un membre (manage_members). Le rôle est
// remis aux permissions de base (parité Prisma : permissions = []).
func (s *Service) UpdateMemberRole(ctx context.Context, userID, mediaID, memberUserID, role string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return err
	}
	if !validRoles[role] {
		return invalid("Rôle invalide")
	}
	target, err := s.member(ctx, mediaID, memberUserID)
	if err != nil {
		return err
	}
	if err := guardOwnerMutation(target, userID, memberUserID, role); err != nil {
		return err
	}
	if err := s.q.UpdateMediaMemberRole(ctx, db.UpdateMediaMemberRoleParams{
		MediaId: mediaID, UserId: toUUID(memberUserID), Role: role,
	}); err != nil {
		return err
	}
	s.audit(ctx, mediaID, userID, "member.role_changed", map[string]any{"targetId": memberUserID, "role": role})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.member.role_changed", "user", memberUserID,
		map[string]any{"role": role, "mediaId": mediaID})
	return nil
}

// UpdateMemberPermissions remplace les permissions granulaires d'un membre.
// Chaque entrée doit appartenir à l'allowlist du package permissions (un
// override inconnu serait stocké, affiché, et n'aurait aucun effet).
func (s *Service) UpdateMemberPermissions(ctx context.Context, userID, mediaID, memberUserID string, perms []string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return err
	}
	if len(perms) > len(permissions.AllMediaPermissions()) {
		return invalid("Trop de permissions")
	}
	known := make(map[string]bool, len(permissions.AllMediaPermissions()))
	for _, p := range permissions.AllMediaPermissions() {
		known[p] = true
	}
	for _, p := range perms {
		base := strings.TrimPrefix(p, "-")
		if !known[base] {
			return invalid("Permission inconnue: %s", p)
		}
	}
	target, err := s.member(ctx, mediaID, memberUserID)
	if err != nil {
		return err
	}
	if target == nil {
		return errNotFound
	}
	if err := s.q.UpdateMediaMemberPermissions(ctx, db.UpdateMediaMemberPermissionsParams{
		MediaId: mediaID, UserId: toUUID(memberUserID), Permissions: perms,
	}); err != nil {
		return err
	}
	s.audit(ctx, mediaID, userID, "member.permissions_changed", map[string]any{"targetId": memberUserID, "permissions": perms})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.member.permissions_changed", "user", memberUserID,
		map[string]any{"permissions": perms, "mediaId": mediaID})
	return nil
}

// RemoveMember retire un membre (impossible pour l'owner).
func (s *Service) RemoveMember(ctx context.Context, userID, mediaID, memberUserID string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return err
	}
	target, err := s.member(ctx, mediaID, memberUserID)
	if err != nil {
		return err
	}
	if target == nil {
		return errNotFound
	}
	if target.Role == "owner" {
		return policy("Impossible de retirer le propriétaire du Média")
	}
	if err := s.q.DeleteMediaMember(ctx, db.DeleteMediaMemberParams{
		MediaId: mediaID, UserId: toUUID(memberUserID),
	}); err != nil {
		return err
	}
	s.audit(ctx, mediaID, userID, "member.removed", map[string]any{"targetId": memberUserID})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.member.removed", "user", memberUserID,
		map[string]any{"mediaId": mediaID})
	return nil
}
