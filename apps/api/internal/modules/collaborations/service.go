// Package collaborations — co-rédaction et attributions d'articles.
// Gestion des invitations par pseudo, liens d'invitation partageables,
// permissions fines et protection anti-spam (zéro fuite d'e-mail).
package collaborations

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

var (
	errForbidden = errors.New("accès refusé")
	errNotFound  = errors.New("introuvable")
)

// ErrorCollab est une erreur métier exposée telle quelle.
type ErrorCollab struct{ msg string }

func (e *ErrorCollab) Error() string { return e.msg }

func collabErr(format string, args ...any) error {
	return &ErrorCollab{msg: fmt.Sprintf(format, args...)}
}

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

// ── DTOs ────────────────────────────────────────────────────────────────────

// CollaborationRequestDTO est une demande de collaboration (scalaires).
type CollaborationRequestDTO struct {
	ID                  string `json:"id"`
	ArticleID           string `json:"articleId"`
	InviterID           string `json:"inviterId"`
	InviteeID           string `json:"inviteeId"`
	Status              string `json:"status"`
	RequestedRole       string `json:"requestedRole"`
	RequestedOrder      int32  `json:"requestedOrder"`
	ShowOnPublicProfile bool   `json:"showOnPublicProfile"`
	CreatedAt           string `json:"createdAt"`
}

// CollaborationUser est un profil utilisateur public lié (inviter/invitee).
// Strictement AUCUN email pour garantir la confidentialité totale.
type CollaborationUser struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl,omitempty"`
	IsCertified bool    `json:"isCertified,omitempty"`
}

// CollaborationArticle est l'article lié dans une liste.
type CollaborationArticle struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Slug  string `json:"slug"`
}

// CollaborationRequestListItem est une demande listée (avec relations).
type CollaborationRequestListItem struct {
	ID                  string               `json:"id"`
	ArticleID           string               `json:"articleId"`
	Status              string               `json:"status"`
	RequestedRole       string               `json:"requestedRole"`
	RequestedOrder      int32                `json:"requestedOrder"`
	ShowOnPublicProfile bool                 `json:"showOnPublicProfile"`
	CreatedAt           string               `json:"createdAt"`
	Article             CollaborationArticle `json:"article"`
	Inviter             *CollaborationUser   `json:"inviter,omitempty"`
	Invitee             *CollaborationUser   `json:"invitee,omitempty"`
}

// CollaborationInviteLinkDTO représente un lien d'invitation d'article.
type CollaborationInviteLinkDTO struct {
	ID        string  `json:"id"`
	ArticleID string  `json:"articleId"`
	Token     string  `json:"token"`
	Role      string  `json:"role"`
	ExpiresAt *string `json:"expiresAt,omitempty"`
	MaxUses   int32   `json:"maxUses"`
	UsedCount int32   `json:"usedCount"`
	IsRevoked bool    `json:"isRevoked"`
	CreatedAt string  `json:"createdAt"`
}

// CollaborationLinkPreviewDTO donne un aperçu avant acceptation.
type CollaborationLinkPreviewDTO struct {
	ArticleID  string            `json:"articleId"`
	Title      string            `json:"title"`
	Slug       string            `json:"slug"`
	Author     CollaborationUser `json:"author"`
	Role       string            `json:"role"`
	ExpiresAt  *string           `json:"expiresAt,omitempty"`
	MaxUses    int32             `json:"maxUses"`
	UsedCount  int32             `json:"usedCount"`
	IsValid    bool              `json:"isValid"`
	StatusText string            `json:"statusText"`
}

// JoinCollaborationResultDTO est le retour après avoir rejoint via lien.
type JoinCollaborationResultDTO struct {
	Success   bool   `json:"success"`
	ArticleID string `json:"articleId"`
	Role      string `json:"role"`
}

// articleAuthorization résout l'article + les droits de l'acteur.
type articleAuthorization struct {
	articleID     string
	authorID      string
	publicationID string
	canInvite     bool
}

func (s *Service) authorizeArticle(ctx context.Context, userID, articleID string) (*articleAuthorization, error) {
	row, err := s.q.GetArticleForCollaboration(ctx, articleID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	auth := &articleAuthorization{
		articleID: row.ID, authorID: row.AuthorID, publicationID: row.PublicationId,
		canInvite: row.AuthorID == userID,
	}
	if !auth.canInvite {
		isMember, err := s.q.IsActiveMediaMember(ctx, db.IsActiveMediaMemberParams{
			PublicationId: row.PublicationId, UserId: toUUID(userID),
		})
		if err != nil {
			return nil, err
		}
		auth.canInvite = isMember
	}
	return auth, nil
}

func (s *Service) notify(ctx context.Context, recipientID, senderID, notifType, articleID string) {
	_ = s.q.InsertArticleContributorNotification(ctx, db.InsertArticleContributorNotificationParams{
		Column1: toUUID(recipientID),
		Column2: toUUID(senderID),
		Column3: db.NotificationType(notifType),
		Column4: articleID,
	})
}

// ── Anti-Spam & Permissions ────────────────────────────────────────────────

func (s *Service) checkAntiSpamInvite(ctx context.Context, inviterID, inviteeID, articleID string) error {
	// 1. Déduplication : invitation PENDING déjà en cours ?
	var pendingCount int
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM "CollaborationRequest"
		WHERE "articleId" = $1 AND "inviteeId" = $2 AND status = 'PENDING'
	`, articleID, toUUID(inviteeID)).Scan(&pendingCount)
	if pendingCount > 0 {
		return collabErr("Une invitation est déjà en attente pour ce contributeur sur cet article.")
	}

	// 2. Cooldown : refus récent (< 24h)
	var recentDecline bool
	_ = s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM "CollaborationRequest"
			WHERE "articleId" = $1 AND "inviteeId" = $2 AND status = 'DECLINED'
			  AND "updatedAt" > now() - INTERVAL '24 hours'
		)
	`, articleID, toUUID(inviteeID)).Scan(&recentDecline)
	if recentDecline {
		return collabErr("Ce contributeur a récemment décliné l'invitation. Veuillez patienter avant de renouveler.")
	}

	// 3. Rate-limit : max 10 invitations par utilisateur par tranche de 10 minutes
	var recentInvitesCount int
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM "CollaborationRequest"
		WHERE "inviterId" = $1 AND "createdAt" > now() - INTERVAL '10 minutes'
	`, toUUID(inviterID)).Scan(&recentInvitesCount)
	if recentInvitesCount >= 10 {
		return collabErr("Limite d'invitations atteinte (10 max par 10 minutes). Veuillez patienter.")
	}

	return nil
}

func (s *Service) checkCollaborationPermission(ctx context.Context, inviterID, inviteeID string, prefPerm string) error {
	switch prefPerm {
	case "NOBODY":
		return collabErr("Cet utilisateur n'accepte pas les invitations de collaboration.")
	case "MEDIA_ONLY":
		var sharesMedia bool
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "MediaMember" mm1
				JOIN "MediaMember" mm2 ON mm2."mediaId" = mm1."mediaId"
				WHERE mm1."userId" = $1 AND mm1.status = 'active'
				  AND mm2."userId" = $2 AND mm2.status = 'active'
			)
		`, toUUID(inviterID), toUUID(inviteeID)).Scan(&sharesMedia)
		if !sharesMedia {
			return collabErr("Cet utilisateur n'accepte que les invitations des membres de ses médias.")
		}
	case "FOLLOWING":
		var isFollowing bool
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "Follows" f
				JOIN "Publication" p ON p.id = f."publicationId"
				WHERE f."readerId" = $1 AND p."authorId" = $2
			)
		`, toUUID(inviteeID), toUUID(inviterID)).Scan(&isFollowing)
		if !isFollowing {
			return collabErr("Cet utilisateur n'accepte que les invitations des créateurs qu'il suit.")
		}
	case "MUTUALS":
		var isMutual bool
		_ = s.pool.QueryRow(ctx, `
			SELECT (
				EXISTS (
					SELECT 1 FROM "Follows" f1
					JOIN "Publication" p1 ON p1.id = f1."publicationId"
					WHERE f1."readerId" = $1 AND p1."authorId" = $2
				) AND EXISTS (
					SELECT 1 FROM "Follows" f2
					JOIN "Publication" p2 ON p2.id = f2."publicationId"
					WHERE f2."readerId" = $2 AND p2."authorId" = $1
				)
			)
		`, toUUID(inviteeID), toUUID(inviterID)).Scan(&isMutual)
		if !isMutual {
			return collabErr("Cet utilisateur n'accepte que les invitations de ses abonnements mutuels (amis).")
		}
	case "EVERYONE", "":
		// OK
	default:
		// OK
	}
	return nil
}

// ── Actions ────────────────────────────────────────────────────────────────

// InviteByUsername invite un contributeur par son @username public (100% confidentiel).
func (s *Service) InviteByUsername(ctx context.Context, userID, articleID, username string) (*CollaborationRequestDTO, error) {
	username = strings.TrimPrefix(strings.TrimSpace(username), "@")
	if username == "" {
		return nil, collabErr("Nom d'utilisateur requis")
	}

	var inviteeID string
	err := s.pool.QueryRow(ctx, `
		SELECT id::text FROM "User"
		WHERE lower(username) = lower($1) AND "isSuspended" = false AND "isShadowbanned" = false
	`, username).Scan(&inviteeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, collabErr("Aucun utilisateur trouvé avec ce nom d'utilisateur.")
	}
	if err != nil {
		return nil, err
	}

	return s.InviteContributor(ctx, userID, articleID, inviteeID, "CO_AUTHOR", 1)
}

// InviteContributor invite un contributeur par ID avec permissions & anti-spam.
func (s *Service) InviteContributor(ctx context.Context, userID, articleID, inviteeID, role string, order int32) (*CollaborationRequestDTO, error) {
	auth, err := s.authorizeArticle(ctx, userID, articleID)
	if err != nil {
		return nil, err
	}
	if !auth.canInvite {
		return nil, collabErr("Vous n'êtes pas autorisé à attribuer cet article.")
	}

	invitee, err := s.q.GetUserWithCollabPrefsByID(ctx, inviteeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, collabErr("Ce contributeur est indisponible.")
	}
	if err != nil {
		return nil, err
	}
	if invitee.IsSuspended || invitee.IsShadowbanned || !invitee.AllowCollab {
		return nil, collabErr("Ce contributeur n'accepte pas les invitations.")
	}
	if invitee.ID == auth.authorID {
		return nil, collabErr("L'auteur principal n'a pas besoin d'une invitation.")
	}

	// Permissions fines de l'invité
	var prefPerm string
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE("collaborationInvitePermission", 'EVERYONE')
		FROM "UserSettings" WHERE "userId" = $1
	`, toUUID(invitee.ID)).Scan(&prefPerm)

	if err := s.checkCollaborationPermission(ctx, userID, invitee.ID, prefPerm); err != nil {
		return nil, err
	}

	// Protection anti-spam
	if err := s.checkAntiSpamInvite(ctx, userID, invitee.ID, articleID); err != nil {
		return nil, err
	}

	if role == "" {
		role = "CO_AUTHOR"
	}
	if order <= 0 {
		order = 1
	}

	req, err := s.q.UpsertCollaborationRequest(ctx, db.UpsertCollaborationRequestParams{
		ArticleId: articleID, InviterId: toUUID(userID), InviteeId: toUUID(invitee.ID),
		RequestedRole: role, RequestedOrder: order,
	})
	if err != nil {
		return nil, err
	}
	s.notify(ctx, invitee.ID, userID, "ARTICLE_CONTRIBUTOR_INVITED", articleID)
	return dtoFromRequest(req), nil
}

// Respond répond à une demande (accepter/refuser + visibilité publique).
func (s *Service) Respond(ctx context.Context, userID, requestID string, accept, showOnPublicProfile bool) error {
	req, err := s.q.GetCollaborationRequestByID(ctx, requestID)
	if errors.Is(err, pgx.ErrNoRows) {
		return collabErr("Demande introuvable")
	}
	if err != nil {
		return err
	}
	if req.InviteeId != userID {
		return collabErr("Vous n'êtes pas le destinataire de cette invitation")
	}
	if req.Status != "PENDING" {
		return collabErr("Cette invitation a déjà été traitée.")
	}

	nextStatus := "DECLINED"
	if accept {
		nextStatus = "ACCEPTED"
	}
	acceptedAt := pgtype.Timestamp{}
	if accept {
		acceptedAt = pgtype.Timestamp{Time: time.Now(), Valid: true}
	}
	if err := s.q.UpdateCollaborationRequestResponse(ctx, db.UpdateCollaborationRequestResponseParams{
		ID: requestID, Status: nextStatus,
		ShowOnPublicProfile: accept && showOnPublicProfile, AcceptedAt: acceptedAt,
	}); err != nil {
		return err
	}

	if accept {
		if err := s.q.UpsertArticleAttribution(ctx, db.UpsertArticleAttributionParams{
			ArticleId: req.ArticleId, UserId: toUUID(userID),
			Role: req.RequestedRole, Order: req.RequestedOrder,
			IsVisible: showOnPublicProfile,
		}); err != nil {
			return err
		}
	} else {
		if err := s.q.UpdateArticleAttributionConsent(ctx, db.UpdateArticleAttributionConsentParams{
			ArticleId: req.ArticleId, UserId: toUUID(userID), ConsentStatus: "DECLINED",
		}); err != nil {
			return err
		}
	}

	notifType := "ARTICLE_CONTRIBUTOR_DECLINED"
	if accept {
		notifType = "ARTICLE_CONTRIBUTOR_ACCEPTED"
	}
	s.notify(ctx, req.InviterId, userID, notifType, req.ArticleId)
	return nil
}

// RemoveContributor retire une attribution publique (auteur OU média).
func (s *Service) RemoveContributor(ctx context.Context, userID, articleID, contributorID string) error {
	auth, err := s.authorizeArticle(ctx, userID, articleID)
	if err != nil {
		return err
	}
	if !auth.canInvite {
		return collabErr("Action non autorisée")
	}
	if contributorID == auth.authorID {
		return collabErr("L'auteur principal ne peut pas être retiré.")
	}

	if err := s.q.UpdateArticleAttributionConsent(ctx, db.UpdateArticleAttributionConsentParams{
		ArticleId: articleID, UserId: toUUID(contributorID), ConsentStatus: "REVOKED",
	}); err != nil {
		return err
	}
	if err := s.q.RevokeCollaborationRequestsForArticle(ctx, db.RevokeCollaborationRequestsForArticleParams{
		ArticleId: articleID, InviteeId: toUUID(contributorID),
	}); err != nil {
		return err
	}
	s.notify(ctx, contributorID, userID, "ARTICLE_CONTRIBUTOR_REMOVED", articleID)
	return nil
}

// WithdrawConsent retire son propre consentement de contributeur.
func (s *Service) WithdrawConsent(ctx context.Context, userID, articleID string) error {
	auth, err := s.authorizeArticle(ctx, userID, articleID)
	if err != nil {
		return err
	}
	if auth.authorID == userID {
		return collabErr("L'auteur principal ne peut pas retirer son attribution.")
	}

	if err := s.q.UpdateArticleAttributionConsent(ctx, db.UpdateArticleAttributionConsentParams{
		ArticleId: articleID, UserId: toUUID(userID), ConsentStatus: "WITHDRAWN",
	}); err != nil {
		return err
	}
	if err := s.q.RevokeCollaborationRequestsForArticle(ctx, db.RevokeCollaborationRequestsForArticleParams{
		ArticleId: articleID, InviteeId: toUUID(userID),
	}); err != nil {
		return err
	}
	s.notify(ctx, auth.authorID, userID, "ARTICLE_CONTRIBUTOR_DECLINED", articleID)
	return nil
}

// ── Liens d'invitation d'article ───────────────────────────────────────────

func (s *Service) CreateInviteLink(ctx context.Context, userID, articleID, role string, expiresInHours, maxUses int) (*CollaborationInviteLinkDTO, error) {
	auth, err := s.authorizeArticle(ctx, userID, articleID)
	if err != nil {
		return nil, err
	}
	if !auth.canInvite {
		return nil, collabErr("Vous n'êtes pas autorisé à créer des liens pour cet article.")
	}
	if role == "" {
		role = "CONTRIBUTOR"
	}
	if maxUses < 0 {
		maxUses = 1
	}

	// Anti-spam création de liens : max 10 liens par heure
	var linksCount int
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM "CollaborationInviteLink"
		WHERE "createdById" = $1 AND "createdAt" > now() - INTERVAL '1 hour'
	`, toUUID(userID)).Scan(&linksCount)
	if linksCount >= 10 {
		return nil, collabErr("Limite de génération de liens atteinte (10 max par heure).")
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

	linkID := "link_" + token[:12]
	var createdAt pgtype.Timestamp
	err = s.pool.QueryRow(ctx, `
		INSERT INTO "CollaborationInviteLink" (id, "articleId", "createdById", token, role, "expiresAt", "maxUses", "usedCount", "isRevoked", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, 0, false, now(), now())
		RETURNING "createdAt"
	`, linkID, articleID, toUUID(userID), token, role, expiresAt, maxUses).Scan(&createdAt)
	if err != nil {
		return nil, err
	}

	dto := &CollaborationInviteLinkDTO{
		ID:        linkID,
		ArticleID: articleID,
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

func (s *Service) ListInviteLinks(ctx context.Context, userID, articleID string) ([]CollaborationInviteLinkDTO, error) {
	auth, err := s.authorizeArticle(ctx, userID, articleID)
	if err != nil {
		return nil, err
	}
	if !auth.canInvite {
		return nil, collabErr("Accès refusé.")
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, "articleId", token, role, "expiresAt", "maxUses", "usedCount", "isRevoked", "createdAt"
		FROM "CollaborationInviteLink"
		WHERE "articleId" = $1
		ORDER BY "createdAt" DESC
	`, articleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CollaborationInviteLinkDTO
	for rows.Next() {
		var item CollaborationInviteLinkDTO
		var expAt, crAt pgtype.Timestamp
		if err := rows.Scan(&item.ID, &item.ArticleID, &item.Token, &item.Role, &expAt, &item.MaxUses, &item.UsedCount, &item.IsRevoked, &crAt); err != nil {
			continue
		}
		item.CreatedAt = crAt.Time.Format(time.RFC3339)
		if expAt.Valid {
			str := expAt.Time.Format(time.RFC3339)
			item.ExpiresAt = &str
		}
		out = append(out, item)
	}
	if out == nil {
		out = []CollaborationInviteLinkDTO{}
	}
	return out, nil
}

func (s *Service) RevokeInviteLink(ctx context.Context, userID, linkID string) error {
	var articleID string
	err := s.pool.QueryRow(ctx, `SELECT "articleId" FROM "CollaborationInviteLink" WHERE id = $1`, linkID).Scan(&articleID)
	if err != nil {
		return collabErr("Lien introuvable.")
	}
	auth, err := s.authorizeArticle(ctx, userID, articleID)
	if err != nil || !auth.canInvite {
		return collabErr("Accès refusé.")
	}
	_, err = s.pool.Exec(ctx, `UPDATE "CollaborationInviteLink" SET "isRevoked" = true, "updatedAt" = now() WHERE id = $1`, linkID)
	return err
}

func (s *Service) GetInviteLinkPreview(ctx context.Context, token string) (*CollaborationLinkPreviewDTO, error) {
	var linkID, articleID, role string
	var expiresAt pgtype.Timestamp
	var maxUses, usedCount int32
	var isRevoked bool

	err := s.pool.QueryRow(ctx, `
		SELECT id, "articleId", role, "expiresAt", "maxUses", "usedCount", "isRevoked"
		FROM "CollaborationInviteLink"
		WHERE token = $1
	`, token).Scan(&linkID, &articleID, &role, &expiresAt, &maxUses, &usedCount, &isRevoked)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, collabErr("Ce lien d'invitation est invalide ou a été supprimé.")
		}
		return nil, err
	}

	var title, slug, authorID string
	var authorName, authorUsername, authorLogo pgtype.Text
	var isCertified bool
	err = s.pool.QueryRow(ctx, `
		SELECT a.title, a.slug, u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "Article" a
		JOIN "User" u ON u.id = a."authorId"
		WHERE a.id = $1
	`, articleID).Scan(&title, &slug, &authorID, &authorName, &authorUsername, &authorLogo, &isCertified)
	if err != nil {
		return nil, collabErr("Article introuvable.")
	}

	isValid := true
	statusText := "Valide"
	if isRevoked {
		isValid = false
		statusText = "Ce lien d'invitation a été révoqué par l'auteur."
	} else if expiresAt.Valid && expiresAt.Time.Before(time.Now()) {
		isValid = false
		statusText = "Ce lien d'invitation a expiré."
	} else if maxUses > 0 && usedCount >= maxUses {
		isValid = false
		statusText = "Ce lien d'invitation a atteint sa limite maximale d'utilisations."
	}

	var expiresAtStr *string
	if expiresAt.Valid {
		str := expiresAt.Time.Format(time.RFC3339)
		expiresAtStr = &str
	}

	return &CollaborationLinkPreviewDTO{
		ArticleID: articleID,
		Title:     title,
		Slug:      slug,
		Author: CollaborationUser{
			ID:          authorID,
			Name:        textPtr(authorName),
			Username:    textPtr(authorUsername),
			LogoURL:     textPtr(authorLogo),
			IsCertified: isCertified,
		},
		Role:       role,
		ExpiresAt:  expiresAtStr,
		MaxUses:    maxUses,
		UsedCount:  usedCount,
		IsValid:    isValid,
		StatusText: statusText,
	}, nil
}

func (s *Service) JoinViaInviteLink(ctx context.Context, userID, token string) (*JoinCollaborationResultDTO, error) {
	preview, err := s.GetInviteLinkPreview(ctx, token)
	if err != nil {
		return nil, err
	}
	if !preview.IsValid {
		return nil, collabErr("%s", preview.StatusText)
	}
	if preview.Author.ID == userID {
		return nil, collabErr("Vous êtes déjà l'auteur principal de cet article.")
	}

	// Insérer ou mettre à jour l'attribution acceptée
	_, err = s.pool.Exec(ctx, `
		INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, 1, true, 'ACCEPTED', now(), now())
		ON CONFLICT ("articleId", "userId") DO UPDATE SET
		  role = $3, "consentStatus" = 'ACCEPTED', "isVisible" = true, "consentUpdatedAt" = now(), "updatedAt" = now()
	`, preview.ArticleID, toUUID(userID), preview.Role)
	if err != nil {
		return nil, err
	}

	// Incrémenter le compteur d'utilisations
	_, _ = s.pool.Exec(ctx, `
		UPDATE "CollaborationInviteLink"
		SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
		WHERE token = $1
	`, token)

	// Notifier l'auteur
	s.notify(ctx, preview.Author.ID, userID, "ARTICLE_CONTRIBUTOR_ACCEPTED", preview.ArticleID)

	return &JoinCollaborationResultDTO{
		Success:   true,
		ArticleID: preview.ArticleID,
		Role:      preview.Role,
	}, nil
}

// ListRequests retourne les demandes reçues et envoyées de l'utilisateur (anonymisées, aucun email).
func (s *Service) ListRequests(ctx context.Context, userID string) (received, sent []CollaborationRequestListItem, err error) {
	recvRows, err := s.q.ListReceivedCollaborationRequests(ctx, toUUID(userID))
	if err != nil {
		return nil, nil, err
	}
	sentRows, err := s.q.ListSentCollaborationRequests(ctx, toUUID(userID))
	if err != nil {
		return nil, nil, err
	}

	received = make([]CollaborationRequestListItem, 0, len(recvRows))
	for _, r := range recvRows {
		received = append(received, CollaborationRequestListItem{
			ID: r.ID, ArticleID: r.ArticleId, Status: r.Status,
			RequestedRole: r.RequestedRole, RequestedOrder: r.RequestedOrder,
			ShowOnPublicProfile: r.ShowOnPublicProfile,
			CreatedAt:           r.CreatedAt.Time.Format(time.RFC3339),
			Article:             CollaborationArticle{ID: r.ArticleId, Title: r.ArticleTitle, Slug: r.ArticleSlug},
			Inviter: &CollaborationUser{
				ID: r.UserID, Name: textPtr(r.UserName), Username: textPtr(r.UserUsername),
			},
		})
	}
	sent = make([]CollaborationRequestListItem, 0, len(sentRows))
	for _, r := range sentRows {
		sent = append(sent, CollaborationRequestListItem{
			ID: r.ID, ArticleID: r.ArticleId, Status: r.Status,
			RequestedRole: r.RequestedRole, RequestedOrder: r.RequestedOrder,
			ShowOnPublicProfile: r.ShowOnPublicProfile,
			CreatedAt:           r.CreatedAt.Time.Format(time.RFC3339),
			Article:             CollaborationArticle{ID: r.ArticleId, Title: r.ArticleTitle, Slug: r.ArticleSlug},
			Invitee: &CollaborationUser{
				ID: r.UserID, Name: textPtr(r.UserName), Username: textPtr(r.UserUsername),
			},
		})
	}
	return received, sent, nil
}

func dtoFromRequest(r db.UpsertCollaborationRequestRow) *CollaborationRequestDTO {
	return &CollaborationRequestDTO{
		ID: r.ID, ArticleID: r.ArticleId, InviterID: r.InviterId, InviteeID: r.InviteeId,
		Status: r.Status, RequestedRole: r.RequestedRole, RequestedOrder: r.RequestedOrder,
		ShowOnPublicProfile: r.ShowOnPublicProfile,
		CreatedAt:           r.CreatedAt.Time.Format(time.RFC3339),
	}
}
