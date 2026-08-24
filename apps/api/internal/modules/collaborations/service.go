// Package collaborations — co-rédaction et attributions d'articles.
// Migration de apps/studio/src/app/(creator)/advanced/actions.ts :
// invitations par email / par id, réponse (accepter/refuser), retrait,
// retrait de consentement, liste des demandes reçues/envoyées.
//
// NB : le `coAuthors: { connect/disconnect }` de l'ancien chemin Prisma passait
// par une table implicite `_ArticleToUser` absente du schéma SQL (drift db
// push). La co-rédaction est modélisée ici via ArticleAttribution (source de
// vérité réelle du consentement et de la visibilité publique).
package collaborations

import (
	"context"
	"errors"
	"fmt"
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

// ErrorCollab est une erreur métier exposée telle quelle (parité messages TS).
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

// ── DTO (miroir des shapes Prisma consommées par advanced/page.tsx) ─────────

// CollaborationRequestDTO est une demande de collaboration (scalaires).
type CollaborationRequestDTO struct {
	ID                  string  `json:"id"`
	ArticleID           string  `json:"articleId"`
	InviterID           string  `json:"inviterId"`
	InviteeID           string  `json:"inviteeId"`
	Status              string  `json:"status"`
	RequestedRole       string  `json:"requestedRole"`
	RequestedOrder      int32   `json:"requestedOrder"`
	ShowOnPublicProfile bool    `json:"showOnPublicProfile"`
	CreatedAt           string  `json:"createdAt"`
}

// CollaborationUser est un utilisateur lié (inviter/invitee) dans une liste.
type CollaborationUser struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Email    string  `json:"email"`
	Username *string `json:"username"`
}

// CollaborationArticle est l'article lié dans une liste.
type CollaborationArticle struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Slug  string `json:"slug"`
}

// CollaborationRequestListItem est une demande listée (avec relations).
type CollaborationRequestListItem struct {
	ID                  string                `json:"id"`
	ArticleID           string                `json:"articleId"`
	Status              string                `json:"status"`
	RequestedRole       string                `json:"requestedRole"`
	RequestedOrder      int32                 `json:"requestedOrder"`
	ShowOnPublicProfile bool                  `json:"showOnPublicProfile"`
	CreatedAt           string                `json:"createdAt"`
	Article             CollaborationArticle  `json:"article"`
	Inviter             *CollaborationUser    `json:"inviter,omitempty"`
	Invitee             *CollaborationUser    `json:"invitee,omitempty"`
}

// articleAuthorization résout l'article + les droits de l'acteur.
type articleAuthorization struct {
	articleID     string
	authorID      string
	publicationID string
	// canInvite : auteur principal OU membre actif du média de la publication.
	canInvite bool
}

// authorizeArticle vérifie l'existence de l'article et si l'utilisateur est
// auteur principal OU membre actif d'un média (parité include Prisma).
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

// checkInvitee valide un invité (existence, suspension, préférences).
func (s *Service) checkInvitee(ctx context.Context, id, email string) (*db.GetUserWithCollabPrefsByEmailRow, error) {
	row, err := s.q.GetUserWithCollabPrefsByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, collabErr("Aucun utilisateur trouvé avec cet email")
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) notify(ctx context.Context, recipientID, senderID, notifType, articleID string) {
	_ = s.q.InsertArticleContributorNotification(ctx, db.InsertArticleContributorNotificationParams{
		Column1: toUUID(recipientID),
		Column2: toUUID(senderID),
		Column3: db.NotificationType(notifType),
		Column4: articleID,
	})
}

// ── Actions ────────────────────────────────────────────────────────────────

// InviteByEmail envoie une demande de co-rédaction par email (parité
// sendCollaborationRequestAction) : auteur principal uniquement.
func (s *Service) InviteByEmail(ctx context.Context, userID, articleID, inviteeEmail string) (*CollaborationRequestDTO, error) {
	auth, err := s.authorizeArticle(ctx, userID, articleID)
	if err != nil {
		return nil, err
	}
	if auth.authorID != userID {
		return nil, collabErr("Seul l'auteur principal de l'article peut inviter des co-auteurs")
	}

	invitee, err := s.checkInvitee(ctx, "", inviteeEmail)
	if err != nil {
		return nil, err
	}
	if !invitee.AllowCollab {
		return nil, collabErr("Ce contributeur a désactivé les invitations de collaboration.")
	}
	if invitee.ID == userID {
		return nil, collabErr("Vous ne pouvez pas vous envoyer une invitation à vous-même")
	}

	req, err := s.q.UpsertCollaborationRequest(ctx, db.UpsertCollaborationRequestParams{
		ArticleId: articleID, InviterId: toUUID(userID), InviteeId: toUUID(invitee.ID),
		RequestedRole: "CO_AUTHOR", RequestedOrder: 1,
	})
	if err != nil {
		return nil, err
	}
	s.notify(ctx, invitee.ID, userID, "ARTICLE_CONTRIBUTOR_INVITED", articleID)
	return dtoFromRequest(req), nil
}

// InviteContributor invite un contributeur par id depuis l'éditeur (parité
// sendArticleContributorInvitationAction) : auteur OU membre média actif.
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
		return nil, collabErr("Ce contributeur est indisponible.")
	}
	if invitee.ID == auth.authorID {
		return nil, collabErr("L'auteur principal n'a pas besoin d'une invitation.")
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

// ListRequests retourne les demandes reçues et envoyées de l'utilisateur.
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
			Article: CollaborationArticle{ID: r.ArticleId, Title: r.ArticleTitle, Slug: r.ArticleSlug},
			Inviter: &CollaborationUser{
				ID: r.UserID, Name: textPtr(r.UserName), Email: r.UserEmail, Username: textPtr(r.UserUsername),
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
			Article: CollaborationArticle{ID: r.ArticleId, Title: r.ArticleTitle, Slug: r.ArticleSlug},
			Invitee: &CollaborationUser{
				ID: r.UserID, Name: textPtr(r.UserName), Email: r.UserEmail, Username: textPtr(r.UserUsername),
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
