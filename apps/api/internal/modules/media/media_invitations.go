package media

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/auditlog"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/permissions"
)

// PendingInvite est une invitation en attente vue par l'invité.
type PendingInvite struct {
	MediaID     string `json:"mediaId"`
	MediaName   string `json:"mediaName"`
	Role        string `json:"role"`
	InvitedAt   string `json:"invitedAt"`
	InviterName string `json:"inviterName,omitempty"`
}

// MediaInviteLinkDTO représente un lien d'invitation à un média.
type MediaInviteLinkDTO struct {
	ID        string  `json:"id"`
	MediaID   string  `json:"mediaId"`
	Token     string  `json:"token"`
	Role      string  `json:"role"`
	ExpiresAt *string `json:"expiresAt,omitempty"`
	MaxUses   int32   `json:"maxUses"`
	UsedCount int32   `json:"usedCount"`
	IsRevoked bool    `json:"isRevoked"`
	CreatedAt string  `json:"createdAt"`
}

// MediaLinkPreviewDTO donne un aperçu avant d'adhérer au média.
type MediaLinkPreviewDTO struct {
	MediaID     string        `json:"mediaId"`
	Name        string        `json:"name"`
	Slug        string        `json:"slug"`
	LogoURL     *string       `json:"logoUrl,omitempty"`
	HeroText    *string       `json:"heroText,omitempty"`
	Role        string        `json:"role"`
	Inviter     *MediaInviter `json:"inviter,omitempty"`
	InviterName *string       `json:"inviterName,omitempty"`
	ExpiresAt   *string       `json:"expiresAt,omitempty"`
	MaxUses     int32         `json:"maxUses"`
	UsedCount   int32         `json:"usedCount"`
	IsValid     bool          `json:"isValid"`
	StatusText  string        `json:"statusText"`
}

// Bornes des liens d'invitation média : 30 jours au plus, 1000 usages, 10
// liens créés par heure et par compte.
const (
	maxInviteLinkHours    = 720
	maxInviteLinkUses     = 1000
	maxInviteLinksPerHour = 10
)

// JoinMediaResultDTO est le retour après adhésion via lien.
type JoinMediaResultDTO struct {
	Success bool   `json:"success"`
	MediaID string `json:"mediaId"`
	Role    string `json:"role"`
}

// InviteMemberByUsername ajoute un collaborateur par son @username public.
func (s *Service) InviteMemberByUsername(ctx context.Context, userID, mediaID, username, role string) (map[string]any, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return nil, err
	}
	username = strings.TrimPrefix(strings.TrimSpace(username), "@")
	if username == "" {
		return nil, invalid("Nom d'utilisateur requis")
	}
	if len([]rune(username)) > 50 {
		return nil, invalid("Nom d'utilisateur invalide")
	}
	if role != "" && !validRoles[role] {
		return nil, invalid("Rôle invalide")
	}
	if role == "" {
		role = "writer"
	}
	if role == "owner" {
		return nil, invalid("Le rôle propriétaire ne peut pas être attribué par invitation")
	}

	var targetID string
	err := s.pool.QueryRow(ctx, `
		SELECT id::text FROM "User"
		WHERE lower(username) = lower($1) AND "isSuspended" = false AND "isShadowbanned" = false
	`, username).Scan(&targetID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, invalid("Aucun utilisateur trouvé avec ce nom d'utilisateur.")
	}
	if err != nil {
		return nil, err
	}
	if targetID == userID {
		return nil, invalid("Vous êtes déjà membre de ce Média.")
	}

	existing, merr := s.member(ctx, mediaID, targetID)
	if merr != nil {
		return nil, merr
	}
	if existing != nil {
		// Une « ré-invitation » d'un membre existant change son rôle : le
		// propriétaire n'est jamais rétrogradable par ce chemin.
		if err := guardOwnerMutation(existing, userID, targetID, role); err != nil {
			return nil, err
		}
		if err := s.q.UpdateMediaMemberRole(ctx, db.UpdateMediaMemberRoleParams{
			MediaId: mediaID, UserId: toUUID(targetID), Role: role,
		}); err != nil {
			return nil, err
		}
		s.audit(ctx, mediaID, userID, "member.role_changed", map[string]any{"targetId": targetID, "role": role})
		auditlog.Write(ctx, s.q, s.flags, userID, "media.member.role_changed", "user", targetID,
			map[string]any{"role": role, "mediaId": mediaID})
		return map[string]any{"success": true, "alreadyMember": true, "userId": targetID}, nil
	}

	if err := s.q.UpsertMediaMember(ctx, db.UpsertMediaMemberParams{
		MediaId: mediaID, UserId: toUUID(targetID), Role: role, Status: "invited",
	}); err != nil {
		return nil, err
	}
	s.audit(ctx, mediaID, userID, "member.invited_pending", map[string]any{"username": username, "role": role})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.member.invited", "user", targetID,
		map[string]any{"role": role, "mediaId": mediaID})

	// La notification est le seul signal reçu par l'invité : son échec ne doit
	// pas être avalé (l'upsert est idempotent, l'appelant peut rejouer).
	m, err := s.q.GetMediaWithPublisher(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	if err := s.q.InsertMediaInviteNotification(ctx, db.InsertMediaInviteNotificationParams{
		RecipientID: toUUID(targetID), SenderID: toUUID(userID), PublisherID: m.PublisherID,
	}); err != nil {
		return nil, err
	}

	return map[string]any{"success": true, "userId": targetID, "role": role, "pending": true}, nil
}

// ListPendingInvites liste les invitations en attente du compte.
func (s *Service) ListPendingInvites(ctx context.Context, userID string) ([]PendingInvite, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT m."mediaId", COALESCE(p."name", m."mediaId"), m."role", m."updatedAt"
		FROM "MediaMember" m
		JOIN "Media" md ON md.id = m."mediaId"
		LEFT JOIN "Publisher" p ON p.id = md."publisherId"
		WHERE m."userId" = $1 AND m."status" = 'invited'
		ORDER BY m."updatedAt" DESC`, toUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PendingInvite{}
	for rows.Next() {
		var (
			inv       PendingInvite
			updatedAt time.Time
		)
		if err := rows.Scan(&inv.MediaID, &inv.MediaName, &inv.Role, &updatedAt); err != nil {
			return nil, err
		}
		inv.InvitedAt = updatedAt.Format(time.RFC3339)
		out = append(out, inv)
	}
	return out, rows.Err()
}

// AcceptInvite active une invitation en attente.
func (s *Service) AcceptInvite(ctx context.Context, userID, mediaID string) (map[string]any, error) {
	m, err := s.member(ctx, mediaID, userID)
	if err != nil {
		// Une panne de lecture n'est pas « pas d'invitation ».
		return nil, err
	}
	if m == nil {
		return nil, errNotFound
	}
	if m.Status == "active" {
		return nil, errAlreadyMember
	}
	if m.Status != "invited" {
		return nil, errNotFound
	}
	n, err := s.q.ActivateMediaMember(ctx, db.ActivateMediaMemberParams{
		MediaId: mediaID, UserId: toUUID(userID),
	})
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, errNotFound
	}
	s.audit(ctx, mediaID, userID, "member.invitation_accepted", map[string]any{"role": m.Role})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.member.invitation_accepted", "user", userID,
		map[string]any{"role": m.Role, "mediaId": mediaID})
	return map[string]any{"success": true, "role": m.Role}, nil
}

// CreateInviteLink crée un lien d'invitation partageable pour le média.
func (s *Service) CreateInviteLink(ctx context.Context, userID, mediaID, role string, expiresInHours, maxUses int) (*MediaInviteLinkDTO, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return nil, err
	}
	if role != "" && !validRoles[role] {
		return nil, invalid("Rôle invalide")
	}
	if role == "" {
		role = "writer"
	}
	// Un lien n'accorde jamais la propriété : sinon toute personne qui reçoit
	// le lien devient owner du média.
	if role == "owner" {
		return nil, invalid("Un lien d'invitation ne peut pas accorder le rôle propriétaire")
	}
	if expiresInHours < 0 {
		return nil, invalid("Durée d'expiration invalide")
	}
	if expiresInHours > maxInviteLinkHours {
		expiresInHours = maxInviteLinkHours
	}
	if maxUses < 0 {
		return nil, invalid("Nombre d'utilisations invalide")
	}
	if maxUses > maxInviteLinkUses {
		maxUses = maxInviteLinkUses
	}

	var linksCount int
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM "MediaInviteLink"
		WHERE "createdById" = $1 AND "createdAt" > now() - INTERVAL '1 hour'
	`, toUUID(userID)).Scan(&linksCount); err != nil {
		// Panne du quota : refuser est plus sûr que de laisser un compte
		// générer des liens à volonté parce que la lecture a échoué.
		return nil, err
	}
	if linksCount >= maxInviteLinksPerHour {
		return nil, invalid("Limite de génération de liens atteinte (10 max par heure).")
	}

	tokenBytes := make([]byte, 24)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(tokenBytes)

	var expiresAt pgtype.Timestamp
	if expiresInHours > 0 {
		expiresAt = pgtype.Timestamp{Time: time.Now().Add(time.Duration(expiresInHours) * time.Hour), Valid: true}
	}

	linkID := "mlink_" + token[:12]
	var createdAt pgtype.Timestamp
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO "MediaInviteLink" (id, "mediaId", "createdById", token, role, "expiresAt", "maxUses", "usedCount", "isRevoked", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, 0, false, now(), now())
		RETURNING "createdAt"
	`, linkID, mediaID, toUUID(userID), token, role, expiresAt, maxUses).Scan(&createdAt); err != nil {
		return nil, err
	}

	s.audit(ctx, mediaID, userID, "media.invite_link_created", map[string]any{"linkId": linkID, "role": role})

	dto := &MediaInviteLinkDTO{
		ID:        linkID,
		MediaID:   mediaID,
		Token:     token,
		Role:      role,
		MaxUses:   int32(maxUses),
		UsedCount: 0,
		IsRevoked: false,
		CreatedAt: createdAt.Time.Format(time.RFC3339),
	}
	if expiresAt.Valid {
		expStr := expiresAt.Time.Format(time.RFC3339)
		dto.ExpiresAt = &expStr
	}
	return dto, nil
}

// ListInviteLinks liste tous les liens d'un média.
func (s *Service) ListInviteLinks(ctx context.Context, userID, mediaID string) ([]MediaInviteLinkDTO, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, "mediaId", token, role, "expiresAt", "maxUses", "usedCount", "isRevoked", "createdAt"
		FROM "MediaInviteLink"
		WHERE "mediaId" = $1
		ORDER BY "createdAt" DESC
		LIMIT 200
	`, mediaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MediaInviteLinkDTO
	for rows.Next() {
		var item MediaInviteLinkDTO
		var expAt, crAt pgtype.Timestamp
		// Une ligne illisible ne disparaît plus silencieusement de la liste.
		if err := rows.Scan(&item.ID, &item.MediaID, &item.Token, &item.Role, &expAt, &item.MaxUses, &item.UsedCount, &item.IsRevoked, &crAt); err != nil {
			return nil, err
		}
		item.CreatedAt = crAt.Time.Format(time.RFC3339)
		if expAt.Valid {
			str := expAt.Time.Format(time.RFC3339)
			item.ExpiresAt = &str
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []MediaInviteLinkDTO{}
	}
	return out, nil
}

// RevokeInviteLink désactive immédiatement un lien de média.
func (s *Service) RevokeInviteLink(ctx context.Context, userID, mediaID, linkID string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageMembers); err != nil {
		return err
	}
	res, err := s.pool.Exec(ctx, `
		UPDATE "MediaInviteLink"
		SET "isRevoked" = true, "updatedAt" = now()
		WHERE id = $1 AND "mediaId" = $2
	`, linkID, mediaID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return errors.New("Lien introuvable")
	}
	s.audit(ctx, mediaID, userID, "media.invite_link_revoked", map[string]any{"linkId": linkID})
	return nil
}

// GetInviteLinkPreview retourne un aperçu public du média invité.
func (s *Service) GetInviteLinkPreview(ctx context.Context, token string) (*MediaLinkPreviewDTO, error) {
	var linkID, mediaID, role string
	var expiresAt pgtype.Timestamp
	var maxUses, usedCount int32
	var isRevoked bool
	var inviterID string

	err := s.pool.QueryRow(ctx, `
		SELECT id, "mediaId", "createdById"::text, role, "expiresAt", "maxUses", "usedCount", "isRevoked"
		FROM "MediaInviteLink"
		WHERE token = $1
	`, token).Scan(&linkID, &mediaID, &inviterID, &role, &expiresAt, &maxUses, &usedCount, &isRevoked)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, invalid("Ce lien d'invitation est invalide ou a expiré.")
		}
		return nil, err
	}

	var pubName, pubSlug string
	var pubLogo, pubHero, inviterName, inviterUsername, inviterLogo pgtype.Text
	err = s.pool.QueryRow(ctx, `
		SELECT p.name, p.slug, p."logoUrl", p."heroText", u.name, u.username, u."logoUrl"
		FROM "Media" m
		JOIN "Publisher" p ON p.id = m."publisherId"
		LEFT JOIN "User" u ON u.id = $2::uuid
		WHERE m.id = $1
	`, mediaID, inviterID).Scan(&pubName, &pubSlug, &pubLogo, &pubHero, &inviterName, &inviterUsername, &inviterLogo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, invalid("Média introuvable.")
	}
	if err != nil {
		// Une panne de lecture n'est pas un lien invalide.
		return nil, err
	}

	isValid := true
	statusText := "Valide"
	if isRevoked {
		isValid = false
		statusText = "Ce lien a été révoqué par les administrateurs du média."
	} else if expiresAt.Valid && expiresAt.Time.Before(time.Now()) {
		isValid = false
		statusText = "Ce lien d'invitation a expiré."
	} else if maxUses > 0 && usedCount >= maxUses {
		isValid = false
		statusText = "Ce lien a atteint sa limite maximale d'utilisations."
	}

	var expiresAtStr *string
	if expiresAt.Valid {
		str := expiresAt.Time.Format(time.RFC3339)
		expiresAtStr = &str
	}

	return &MediaLinkPreviewDTO{
		MediaID:  mediaID,
		Name:     pubName,
		Slug:     pubSlug,
		LogoURL:  textPtr(pubLogo),
		HeroText: textPtr(pubHero),
		Role:     role,
		Inviter: &MediaInviter{
			ID:       inviterID,
			Name:     textPtr(inviterName),
			Username: textPtr(inviterUsername),
			LogoURL:  textPtr(inviterLogo),
		},
		InviterName: textPtr(inviterName),
		ExpiresAt:   expiresAtStr,
		MaxUses:     maxUses,
		UsedCount:   usedCount,
		IsValid:     isValid,
		StatusText:  statusText,
	}, nil
}

// JoinViaInviteLink rejoint un média via un lien valide sans email requis.
func (s *Service) JoinViaInviteLink(ctx context.Context, userID, token string) (*JoinMediaResultDTO, error) {
	preview, err := s.GetInviteLinkPreview(ctx, token)
	if err != nil {
		return nil, err
	}
	if !preview.IsValid {
		return nil, invalid("%s", preview.StatusText)
	}

	existing, err := s.member(ctx, preview.MediaID, userID)
	if err == nil && existing != nil && existing.Status == "active" {
		return &JoinMediaResultDTO{
			Success: true,
			MediaID: preview.MediaID,
			Role:    existing.Role,
		}, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	if err := tq.UpsertMediaMember(ctx, db.UpsertMediaMemberParams{
		MediaId: preview.MediaID, UserId: toUUID(userID), Role: preview.Role, Status: "active",
	}); err != nil {
		return nil, err
	}

	// Décrément conditionnel : la preview a été lue hors transaction, le lien
	// peut avoir été révoqué, expiré ou épuisé entre-temps. Avant, l'UPDATE
	// incrémentait sans condition — un lien `maxUses = 1` servait N fois en
	// concurrence et un lien révoqué restait utilisable.
	res, err := tx.Exec(ctx, `
		UPDATE "MediaInviteLink"
		SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
		WHERE token = $1 AND "mediaId" = $2
		  AND "isRevoked" = false
		  AND ("expiresAt" IS NULL OR "expiresAt" > now())
		  AND ("maxUses" = 0 OR "usedCount" < "maxUses")
	`, token, preview.MediaID)
	if err != nil {
		return nil, err
	}
	if res.RowsAffected() == 0 {
		return nil, invalid("Ce lien d'invitation vient d'expirer ou d'être révoqué.")
	}

	if err := tq.InsertMediaAuditLog(ctx, db.InsertMediaAuditLogParams{
		MediaId: preview.MediaID, ActorId: toUUID(userID), Action: "member.joined_via_link",
		Metadata: string(mustJSON(map[string]string{"role": preview.Role})),
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &JoinMediaResultDTO{
		Success: true,
		MediaID: preview.MediaID,
		Role:    preview.Role,
	}, nil
}
