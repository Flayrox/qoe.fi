// Package media — gestion des Médias (organisations) côté créateur.
// Migration de apps/studio/src/app/(creator)/media/actions.ts + page.tsx vers Go.
// Les DTO imitent les shapes Prisma consommées par MediaStudioClient.
package media

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/permissions"
)

var (
	errForbidden = errors.New("accès refusé")
	errNotFound  = errors.New("introuvable")
)

// Service porte les opérations média du créateur.
type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
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

func (s *Service) audit(ctx context.Context, mediaID, actorID, action string, metadata any) {
	raw, _ := json.Marshal(metadata)
	_ = s.q.InsertMediaAuditLog(ctx, db.InsertMediaAuditLogParams{
		MediaId: mediaID, ActorId: toUUID(actorID), Action: action, Metadata: raw,
	})
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

	// Publication personnelle existante → id/slug officiels.
	if pub, err := s.q.GetPersonalPublicationForUser(ctx, userID); err == nil {
		personal.ID = pub.ID
		personal.Name = pub.Name
		personal.Slug = pub.Slug
		personal.LogoURL = textPtr(pub.LogoUrl)
	}

	rows, err := s.q.GetUserMediaMemberships(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	medias := make([]WorkspaceDTO, 0, len(rows))
	for _, r := range rows {
		role := r.Role
		medias = append(medias, WorkspaceDTO{
			ID: r.MediaID, Name: r.PublicationName, Slug: r.PublicationSlug,
			LogoURL: textPtr(r.PublicationLogo), Type: "MEDIA", Role: &role,
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
	InvitesCount int32   `json:"invitesCount"`
}

// ListMedia retourne les médias dont l'utilisateur est membre (avec compteurs).
func (s *Service) ListMedia(ctx context.Context, userID string) ([]MediaListItem, error) {
	rows, err := s.q.GetUserMediaMemberships(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	items := make([]MediaListItem, 0, len(rows))
	for _, r := range rows {
		members, _ := s.q.CountMediaMembers(ctx, r.MediaID)
		invites, _ := s.q.CountMediaInvites(ctx, r.MediaID)
		items = append(items, MediaListItem{
			ID:           r.MediaID,
			Name:         r.PublicationName,
			Slug:         r.PublicationSlug,
			Subdomain:    textPtr(r.PublicationSubdomain),
			Bio:          textPtr(r.PublicationBio),
			LogoURL:      textPtr(r.PublicationLogo),
			Role:         r.Role,
			MembersCount: members,
			InvitesCount: invites,
		})
	}
	return items, nil
}

// ── Détail (parité getMediaByIdAction — shapes Prisma) ──────────────────────

// MediaPublication est la publication d'un média (détail studio).
type MediaPublication struct {
	ID               string      `json:"id"`
	Name             string      `json:"name"`
	Slug             string      `json:"slug"`
	Subdomain        *string     `json:"subdomain"`
	CustomDomain     *string     `json:"customDomain"`
	Bio              *string     `json:"bio"`
	LogoURL          *string     `json:"logoUrl"`
	HeroText         *string     `json:"heroText"`
	HeaderImageURL   *string     `json:"headerImageUrl"`
	FooterText       *string     `json:"footerText"`
	AccentColor      *string     `json:"accentColor"`
	ThemeMode        *string     `json:"themeMode"`
	LayoutStyle      *string     `json:"layoutStyle"`
	SeoTitle         *string     `json:"seoTitle"`
	SeoDescription   *string     `json:"seoDescription"`
	AllowIndexing    bool        `json:"allowIndexing"`
	SupportURL       *string     `json:"supportUrl"`
	FontFamily       *string     `json:"fontFamily"`
	Count            MediaCount  `json:"_count"`
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
}

// MediaInviteDTO est une invitation PENDING d'un média.
type MediaInviteDTO struct {
	ID        string       `json:"id"`
	Email     string       `json:"email"`
	Role      string       `json:"role"`
	Status    string       `json:"status"`
	CreatedAt string       `json:"createdAt"`
	ExpiresAt *string      `json:"expiresAt"`
	Inviter   MediaInviter `json:"inviter"`
}

// MediaDetail est le média complet (parité include Prisma de getMediaByIdAction).
type MediaDetail struct {
	ID          string           `json:"id"`
	Publication MediaPublication `json:"publication"`
	Members     []MediaMemberDTO `json:"members"`
	Invites     []MediaInviteDTO `json:"invites"`
}

func (s *Service) mediaDetail(ctx context.Context, mediaID string, row db.GetMediaWithPublicationRow) (MediaDetail, error) {
	articles, err := s.q.CountArticlesByPublication(ctx, row.PublicationID)
	if err != nil {
		return MediaDetail{}, err
	}
	members, err := s.q.ListMediaMembers(ctx, mediaID)
	if err != nil {
		return MediaDetail{}, err
	}
	invites, err := s.q.ListMediaInvites(ctx, mediaID)
	if err != nil {
		return MediaDetail{}, err
	}

	detail := MediaDetail{
		ID: row.MediaID,
		Publication: MediaPublication{
			ID:             row.PublicationID,
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
		Invites: make([]MediaInviteDTO, 0, len(invites)),
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
	for _, i := range invites {
		detail.Invites = append(detail.Invites, MediaInviteDTO{
			ID: i.ID, Email: i.Email, Role: i.Role, Status: i.Status,
			CreatedAt: i.CreatedAt.Time.Format(time.RFC3339),
			ExpiresAt: timestampPtr(i.ExpiresAt),
			Inviter: MediaInviter{
				ID: i.InviterID, Name: textPtr(i.InviterName), Username: textPtr(i.InviterUsername),
			},
		})
	}
	return detail, nil
}

// GetMedia retourne le détail complet d'un média (membre requis).
func (s *Service) GetMedia(ctx context.Context, userID, mediaID string) (MediaDetail, string, error) {
	m, err := s.authorizeMedia(ctx, mediaID, userID, "")
	if err != nil {
		return MediaDetail{}, "", err
	}
	row, err := s.q.GetMediaWithPublication(ctx, mediaID)
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

// CreateMedia crée Publication (MEDIA) + Media + membre owner + audit (transaction).
func (s *Service) CreateMedia(ctx context.Context, userID, name, slug, bio, logoURL string) (map[string]string, error) {
	clean := cleanSlug(slug)
	if name == "" || clean == "" {
		return nil, errors.New("Le nom et le permalien du Média sont requis")
	}

	exists, err := s.q.CheckMediaSlugExists(ctx, clean)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("Ce permalien de Média est déjà utilisé par un autre journal")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	pubID, err := tq.CreateMediaPublication(ctx, db.CreateMediaPublicationParams{
		Name: name, Slug: clean, Subdomain: textFromString(clean),
		Bio: textFromString(bio), LogoUrl: textFromString(logoURL), AccentColor: textFromString("#EE4B2B"),
	})
	if err != nil {
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
		Metadata: mustJSON(map[string]string{"name": name, "slug": clean}),
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]string{"id": mediaID, "publicationId": pubID}, nil
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

// UpdateSettings applique une mise à jour partielle des réglages du média
// (identity, design, SEO) — RBAC media:manage_settings. Retourne la publication.
func (s *Service) UpdateSettings(ctx context.Context, userID, mediaID string, body map[string]any) (MediaPublication, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageSettings); err != nil {
		return MediaPublication{}, err
	}

	row, err := s.q.GetMediaWithPublication(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MediaPublication{}, errNotFound
		}
		return MediaPublication{}, err
	}

	fields := map[string]any{}
	for key, col := range mediaStringColumns {
		if v, ok := body[key]; ok {
			if v == nil {
				fields[col] = nil
				continue
			}
			str, ok := v.(string)
			if !ok {
				return MediaPublication{}, errors.New("champ invalide: " + key)
			}
			fields[col] = str
		}
	}
	if v, ok := body["allowIndexing"]; ok {
		b, ok := v.(bool)
		if !ok {
			return MediaPublication{}, errors.New("allowIndexing doit être un booléen")
		}
		fields["allowIndexing"] = b
	}

	if len(fields) > 0 {
		if err := s.updatePublication(ctx, row.PublicationID, fields); err != nil {
			return MediaPublication{}, err
		}
	}

	keys := make([]string, 0, len(body))
	for k := range body {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	s.audit(ctx, mediaID, userID, "media.settings_updated", map[string]any{"fields": keys})

	updated, err := s.q.GetMediaWithPublication(ctx, mediaID)
	if err != nil {
		return MediaPublication{}, err
	}
	detail, err := s.mediaDetail(ctx, mediaID, updated)
	if err != nil {
		return MediaPublication{}, err
	}
	return detail.Publication, nil
}

// updatePublication construit un UPDATE dynamique limité à un allowlist de colonnes.
func (s *Service) updatePublication(ctx context.Context, publicationID string, fields map[string]any) error {
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	sets := make([]string, 0, len(keys))
	args := make([]any, 0, len(keys)+1)
	args = append(args, publicationID)
	for _, k := range keys {
		sets = append(sets, `"`+k+`" = $`+strconv.Itoa(len(args)+1))
		args = append(args, fields[k])
	}
	query := `UPDATE "Publication" SET ` + strings.Join(sets, ", ") + `, "updatedAt" = now() WHERE id = $1`
	_, err := s.pool.Exec(ctx, query, args...)
	return err
}

// ── Invitations (parité inviteMediaMemberAction / acceptMediaInviteAction) ──

var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// InviteMember invite un rédacteur par email ; si le compte existe déjà et est
// membre, son rôle est mis à jour. RBAC media:manage_members.
func (s *Service) InviteMember(ctx context.Context, userID, mediaID, email, role string) (map[string]any, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return nil, err
	}
	cleanEmail := strings.ToLower(strings.TrimSpace(email))
	if !emailRegex.MatchString(cleanEmail) {
		return nil, errors.New("Adresse email invalide")
	}
	if role != "" && !validRoles[role] {
		return nil, errors.New("Rôle invalide")
	}
	if role == "" {
		role = "writer"
	}

	// Compte existant → mise à jour du rôle si déjà membre.
	target, err := s.q.GetUserByEmail(ctx, cleanEmail)
	if err == nil {
		if existing, err := s.member(ctx, mediaID, target.ID); err == nil && existing != nil {
			if err := s.q.UpdateMediaMemberRole(ctx, db.UpdateMediaMemberRoleParams{
				MediaId: mediaID, UserId: toUUID(target.ID), Role: role,
			}); err != nil {
				return nil, err
			}
			s.audit(ctx, mediaID, userID, "member.role_changed", map[string]any{"targetId": target.ID, "role": role})
			return map[string]any{"success": true, "alreadyMember": true}, nil
		}
	}

	// Sinon : invitation par email (7 jours).
	token := make([]byte, 24)
	if _, err := rand.Read(token); err != nil {
		return nil, err
	}
	inviteID, err := s.q.CreateMediaInvite(ctx, db.CreateMediaInviteParams{
		MediaId: mediaID, InviterId: toUUID(userID), Email: cleanEmail, Role: role,
		Token: hex.EncodeToString(token), ExpiresAt: pgtype.Timestamp{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true},
	})
	if err != nil {
		return nil, err
	}
	s.audit(ctx, mediaID, userID, "member.invited", map[string]any{"email": cleanEmail, "role": role})

	// Notification au membre existant (s'il a un compte) — dédup + prefs en SQL.
	if err == nil && target.ID != userID {
		pub := pgtype.Text{}
		if m, merr := s.q.GetMediaWithPublication(ctx, mediaID); merr == nil {
			pub = textFromString(m.PublicationID)
		}
		_ = s.q.InsertMediaInviteNotification(ctx, db.InsertMediaInviteNotificationParams{
			RecipientId: toUUID(target.ID), SenderId: toUUID(userID), PublicationId: pub,
		})
	}
	return map[string]any{"success": true, "inviteId": inviteID}, nil
}

// AcceptInvite accepte une invitation par token : upsert membre, statut
// ACCEPTED, audit + notification à l'inviteur.
func (s *Service) AcceptInvite(ctx context.Context, userID, token string) (string, error) {
	invite, err := s.q.GetMediaInviteByToken(ctx, token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errors.New("Invitation introuvable ou déjà utilisée")
		}
		return "", err
	}
	if invite.Status != "PENDING" {
		return "", errors.New("Cette invitation a déjà été traitée")
	}
	if invite.ExpiresAt.Valid && invite.ExpiresAt.Time.Before(time.Now()) {
		return "", errors.New("Cette invitation a expiré")
	}
	identity, err := s.q.GetUserIdentity(ctx, userID)
	if err != nil {
		return "", errNotFound
	}
	if !strings.EqualFold(invite.Email, identity.Email) {
		return "", errors.New("Cette invitation n'est pas destinée à ce compte")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	if err := tq.UpsertMediaMember(ctx, db.UpsertMediaMemberParams{
		MediaId: invite.MediaId, UserId: toUUID(userID), Role: invite.Role, Status: "active",
	}); err != nil {
		return "", err
	}
	if err := tq.UpdateMediaInviteStatus(ctx, db.UpdateMediaInviteStatusParams{
		ID: invite.ID, Status: "ACCEPTED",
	}); err != nil {
		return "", err
	}
	if err := tq.InsertMediaAuditLog(ctx, db.InsertMediaAuditLogParams{
		MediaId: invite.MediaId, ActorId: toUUID(userID), Action: "member.joined",
		Metadata: mustJSON(map[string]string{"email": identity.Email}),
	}); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}

	// Notifier l'inviteur.
	if invite.InviterID != userID {
		pub := pgtype.Text{}
		if m, merr := s.q.GetMediaWithPublication(ctx, invite.MediaId); merr == nil {
			pub = textFromString(m.PublicationID)
		}
		_ = s.q.InsertMediaMemberJoinedNotification(ctx, db.InsertMediaMemberJoinedNotificationParams{
			RecipientId: toUUID(invite.InviterID), SenderId: toUUID(userID), PublicationId: pub,
		})
	}
	return invite.MediaId, nil
}

// ── Membres (rôle / permissions / retrait) ──────────────────────────────────

// UpdateMemberRole change le rôle d'un membre (manage_members). Le rôle est
// remis aux permissions de base (parité Prisma : permissions = []).
func (s *Service) UpdateMemberRole(ctx context.Context, userID, mediaID, memberUserID, role string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return err
	}
	if !validRoles[role] {
		return errors.New("Rôle invalide")
	}
	if err := s.q.UpdateMediaMemberRole(ctx, db.UpdateMediaMemberRoleParams{
		MediaId: mediaID, UserId: toUUID(memberUserID), Role: role,
	}); err != nil {
		return err
	}
	s.audit(ctx, mediaID, userID, "member.role_changed", map[string]any{"targetId": memberUserID, "role": role})
	return nil
}

// UpdateMemberPermissions remplace les permissions granulaires d'un membre.
func (s *Service) UpdateMemberPermissions(ctx context.Context, userID, mediaID, memberUserID string, perms []string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return err
	}
	if err := s.q.UpdateMediaMemberPermissions(ctx, db.UpdateMediaMemberPermissionsParams{
		MediaId: mediaID, UserId: toUUID(memberUserID), Permissions: perms,
	}); err != nil {
		return err
	}
	s.audit(ctx, mediaID, userID, "member.permissions_changed", map[string]any{"targetId": memberUserID, "permissions": perms})
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
		return errors.New("Impossible de retirer le propriétaire du Média")
	}
	if err := s.q.DeleteMediaMember(ctx, db.DeleteMediaMemberParams{
		MediaId: mediaID, UserId: toUUID(memberUserID),
	}); err != nil {
		return err
	}
	s.audit(ctx, mediaID, userID, "member.removed", map[string]any{"targetId": memberUserID})
	return nil
}
