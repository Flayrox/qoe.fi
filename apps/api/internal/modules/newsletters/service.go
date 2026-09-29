// Package newsletters — envoi d'emails aux abonnés par les créateurs.
package newsletters

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/abuse"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

var (
	errNotFound       = errors.New("newsletter introuvable")
	errForbidden      = errors.New("vous ne gérez pas cette publication")
	errNotDraft       = errors.New("seuls les brouillons peuvent être modifiés ou envoyés")
	errConfirmInvalid = errors.New("lien de confirmation invalide ou déjà utilisé")
)

// Service porte les opérations newsletters (côté créateur).
type Service struct {
	q  newsletterQuerier
	ac *asynq.Client
	// emailVerifier lit l'adresse et sa confirmation côté fournisseur
	// (branché par le serveur ; nil = parcours connectés désactivés).
	emailVerifier emailVerifier
	// onReconfirmConfirmed constate une confirmation individuelle auprès du
	// suivi des vagues de reconfirmation (compteurs). Branché par le serveur ;
	// nil en test. On ne fabrique rien ici : `confirmedAt` a déjà été franchi
	// par le chemin normal juste au-dessus.
	onReconfirmConfirmed func(ctx context.Context, publicationID, email string) error
	// budgetPool (optionnel) : plafonne les e-mails de confirmation.
	budgetPool abuse.BudgetDB
}

// SetReconfirmConfirmedHook branche le constat de confirmation (module
// imports). Même pattern que les autres injections : pas de cycle d'import,
// appel best-effort qui n'invalide jamais une confirmation.
func (s *Service) SetReconfirmConfirmedHook(fn func(ctx context.Context, publicationID, email string) error) {
	s.onReconfirmConfirmed = fn
}

// emailVerifier est la surface minimale du module users lue par les parcours
// connectés : adresse du compte et confirmation côté fournisseur. Interface
// (et non import direct) pour rester mockable en test.
type emailVerifier interface {
	GetEmailVerification(ctx context.Context, userID string) (string, bool, error)
}

// SetEmailVerifier branche la vérification d'adresse du compte (module users).
func (s *Service) SetEmailVerifier(v emailVerifier) { s.emailVerifier = v }

// budgetPool sert les budgets anti-abus (fiche 06 P0 : confirmations
// plafonnées). Branché par le serveur ; nil = dégradation ouverte (tests,
// environnements sans base directe). abuse n'importe aucun module métier :
// pas de cycle d'import.
func (s *Service) SetBudgetPool(p abuse.BudgetDB) { s.budgetPool = p }

func NewService(q newsletterQuerier, ac *asynq.Client) *Service {
	return &Service{q: q, ac: ac}
}

// Issue est une newsletter (brouillon, en cours ou envoyée).
type Issue struct {
	ID              string  `json:"id"`
	PublicationID   string  `json:"publicationId"`
	Subject         string  `json:"subject"`
	PreviewText     *string `json:"previewText"`
	Html            string  `json:"html"`
	Status          string  `json:"status"`
	TotalRecipients int32   `json:"totalRecipients"`
	SentCount       int32   `json:"sentCount"`
	FailedCount     int32   `json:"failedCount"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
	SentAt          *string `json:"sentAt"`
}

// CreateInput est le contenu rédigeable d'une newsletter.
type CreateInput struct {
	PublicationID string `json:"publicationId"`
	Subject       string `json:"subject"`
	PreviewText   string `json:"previewText"`
	Html          string `json:"html"`
}

// resolvePublication vérifie que l'utilisateur gère la publication (perso ou
// owner d'un média) et renvoie son id.
func (s *Service) resolvePublication(ctx context.Context, userID, publicationID string) (string, error) {
	if publicationID == "" {
		pubID, err := s.q.GetUserPublicationID(ctx, userID)
		if err != nil || pubID == "" {
			return "", errForbidden
		}
		return pubID, nil
	}
	owns, err := s.q.UserOwnsPublication(ctx, db.UserOwnsPublicationParams{
		ID:            userID,
		PublicationId: pgtype.Text{String: publicationID, Valid: true},
	})
	if err != nil {
		return "", err
	}
	if !owns {
		return "", errForbidden
	}
	return publicationID, nil
}

func fromModel(r db.NewsletterIssue) Issue {
	issue := Issue{
		ID:              r.ID,
		PublicationID:   r.PublicationId,
		Subject:         r.Subject,
		Html:            r.Html,
		Status:          r.Status,
		TotalRecipients: r.TotalRecipients,
		SentCount:       r.SentCount,
		FailedCount:     r.FailedCount,
		CreatedAt:       r.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:       r.UpdatedAt.Time.Format(time.RFC3339),
	}
	if r.PreviewText.Valid {
		v := r.PreviewText.String
		issue.PreviewText = &v
	}
	if r.SentAt.Valid {
		v := r.SentAt.Time.Format(time.RFC3339)
		issue.SentAt = &v
	}
	return issue
}

// ListIssues renvoie les newsletters de la publication du créateur (DESC).
func (s *Service) ListIssues(ctx context.Context, userID, publicationID string) ([]Issue, error) {
	pubID, err := s.resolvePublication(ctx, userID, publicationID)
	if err != nil {
		return nil, err
	}
	rows, err := s.q.ListNewsletterIssuesByPublication(ctx, pubID)
	if err != nil {
		return nil, err
	}
	out := make([]Issue, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromModel(r))
	}
	return out, nil
}

// CreateDraft crée un brouillon de newsletter pour la publication du créateur.
func (s *Service) CreateDraft(ctx context.Context, userID string, in CreateInput) (*Issue, error) {
	if in.Subject == "" || in.Html == "" {
		return nil, errors.New("subject et html requis")
	}
	pubID, err := s.resolvePublication(ctx, userID, in.PublicationID)
	if err != nil {
		return nil, err
	}
	preview := pgtype.Text{}
	if in.PreviewText != "" {
		preview = pgtype.Text{String: in.PreviewText, Valid: true}
	}
	row, err := s.q.CreateNewsletterIssue(ctx, db.CreateNewsletterIssueParams{
		PublicationId: pubID,
		Subject:       in.Subject,
		PreviewText:   preview,
		Html:          in.Html,
	})
	if err != nil {
		return nil, err
	}
	issue := fromModel(row)
	return &issue, nil
}

// UpdateDraft met à jour un brouillon (DRAFT uniquement).
func (s *Service) UpdateDraft(ctx context.Context, userID, issueID string, in CreateInput) (*Issue, error) {
	if in.Subject == "" || in.Html == "" {
		return nil, errors.New("subject et html requis")
	}
	if _, err := s.checkOwnership(ctx, userID, issueID); err != nil {
		return nil, err
	}
	preview := pgtype.Text{}
	if in.PreviewText != "" {
		preview = pgtype.Text{String: in.PreviewText, Valid: true}
	}
	row, err := s.q.UpdateNewsletterIssueDraft(ctx, db.UpdateNewsletterIssueDraftParams{
		ID:          issueID,
		Subject:     in.Subject,
		PreviewText: preview,
		Html:        in.Html,
	})
	if err != nil {
		// Hors DRAFT (déjà envoyée) ou issue inconnue : l'update est refusé
		// proprement — pas de modification d'une issue en cours d'envoi.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotDraft
		}
		return nil, err
	}
	issue := fromModel(row)
	return &issue, nil
}

// DeleteDraft supprime un brouillon (DRAFT uniquement).
func (s *Service) DeleteDraft(ctx context.Context, userID, issueID string) error {
	issue, err := s.checkOwnership(ctx, userID, issueID)
	if err != nil {
		return err
	}
	if issue.Status != "DRAFT" {
		return errNotDraft
	}
	return s.q.DeleteNewsletterIssueDraft(ctx, issueID)
}

// Send passe un brouillon en SENDING et enqueue la tâche de distribution.
// Anti-spam : seuls les brouillons peuvent être envoyés (une issue déjà
// SENDING/SENT/FAILED renvoie errNotDraft) — pas de double envoi, pas de
// re-send après clôture.
func (s *Service) Send(ctx context.Context, userID, issueID string) error {
	issue, err := s.checkOwnership(ctx, userID, issueID)
	if err != nil {
		return err
	}
	if issue.Status != "DRAFT" {
		return errNotDraft
	}
	if _, err := s.q.SetNewsletterIssueSending(ctx, issueID); err != nil {
		return err
	}
	return queue.PublishNewsletterSend(s.ac, queue.NewsletterSendPayload{IssueID: issueID})
}

// checkOwnership vérifie que l'issue appartient à une publication du créateur
// et renvoie l'issue (le statut sert aux gardes anti-double-envoi).
func (s *Service) checkOwnership(ctx context.Context, userID, issueID string) (db.NewsletterIssue, error) {
	issue, err := s.q.GetNewsletterIssue(ctx, issueID)
	if err != nil {
		return db.NewsletterIssue{}, errNotFound
	}
	owns, err := s.q.UserOwnsPublication(ctx, db.UserOwnsPublicationParams{
		ID:            userID,
		PublicationId: pgtype.Text{String: issue.PublicationId, Valid: true},
	})
	if err != nil {
		return db.NewsletterIssue{}, err
	}
	if !owns {
		return db.NewsletterIssue{}, errForbidden
	}
	return issue, nil
}

// Unsubscribe désactive receiveArticles pour un abonné (lien public, sans auth).
func (s *Service) Unsubscribe(ctx context.Context, publicationID, email string) error {
	if publicationID == "" || email == "" {
		return errors.New("publicationId et email requis")
	}
	return s.q.UnsubscribeNewsletterSubscriber(ctx, db.UnsubscribeNewsletterSubscriberParams{
		PublicationId: publicationID,
		Email:         email,
	})
}

// NewConfirmationToken tire un jeton opaque de confirmation (256 bits, hex).
// Générateur unique du domaine : inscriptions publiques, clé API et
// reconfirmations d'import utilisent le même format — le lien vérifie
// (email, publication, token) + signature HMAC, et le token est consommé à
// usage unique (ConfirmSubscriberByToken le met à NULL).
func NewConfirmationToken() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}

// ConfirmSubscriber consomme un token de confirmation double opt-in : active
// receiveArticles, horodate confirmedAt et efface le token (usage unique).
// Retourne errConfirmInvalid si le token ne correspond pas (lien expiré,
// déjà consommé ou falsifié) — la sig HMAC a déjà été vérifiée côté handler.
func (s *Service) ConfirmSubscriber(ctx context.Context, publicationID, email, token string) error {
	if publicationID == "" || email == "" || token == "" {
		return errConfirmInvalid
	}
	_, err := s.q.ConfirmSubscriberByToken(ctx, db.ConfirmSubscriberByTokenParams{
		Email:             email,
		PublicationId:     publicationID,
		ConfirmationToken: pgtype.Text{String: token, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return errConfirmInvalid
	}
	if err != nil {
		return err
	}
	// Rattachement au compte (fiche 01 §4) : si un compte qoe.fi utilise cette
	// adresse comme identifiant, l'abonnement confirmé y apparaît — sans créer
	// de doublon d'envoi (l'affichage n'est pas un nouvel abonnement) et sans
	// jamais réactiver quoi que ce soit (on ne touche qu'à userId, sur une
	// ligne qu'on vient d'activer par ce même clic). Un compte ne récupère
	// ainsi que les abonnements de SA propre adresse vérifiée d'inscription.
	if err := s.q.AttachSubscriberToAccount(ctx, db.AttachSubscriberToAccountParams{
		Email:         email,
		PublicationId: publicationID,
	}); err != nil {
		log.Printf("[newsletters] rattachement %s: %v", email, err)
	}
	// Confirmation effective → email de bienvenue (localisé, personnalisé,
	// coupable par le créateur côté worker). Best-effort : une panne Redis
	// n'invalide JAMAIS une confirmation.
	if err := queue.PublishSubscriberWelcome(s.ac, queue.SubscriberWelcomePayload{
		Email:         email,
		PublicationID: publicationID,
	}); err != nil {
		log.Printf("[newsletters] subscriber.welcome enqueue: %v", err)
	}
	// Si ce clic solde une demande de reconfirmation d'import, on l'impute à
	// la vague (compteurs). Best-effort également : un échec ici ne change
	// rien à la confirmation, déjà actée et définitive.
	if s.onReconfirmConfirmed != nil {
		if err := s.onReconfirmConfirmed(ctx, publicationID, email); err != nil {
			log.Printf("[newsletters] reconfirm impute %s/%s: %v", publicationID, email, err)
		}
	}
	return nil
}

// SelfSubscribeResult distingue les deux issues du parcours connecté.
type SelfSubscribeResult struct {
	// Active est vrai quand l'abonnement est effectif immédiatement (adresse
	// vérifiée) ; faux quand un e-mail de confirmation vient de partir.
	Active bool `json:"active"`
}

// SubscribeSelf abonne le compte connecté à une publication, sans ressaisir
// d'adresse (fiche 01 §2 : qoe.fi sait déjà qu'il contrôle son adresse).
// Règles : l'adresse demandée doit être exactement celle du compte (sinon
// 403 — saisir l'adresse d'un compte ne prouve pas qu'on en est titulaire) ;
// si elle est confirmée côté fournisseur, activation directe (légitime :
// adresse vérifiée + action explicite + session) ; sinon, parcours invité
// (pending + e-mail de confirmation). La réponse ne distingue pas les cas
// au-delà du flag `active`, et ne révèle jamais l'existence d'un compte.
func (s *Service) SubscribeSelf(ctx context.Context, userID, email, publicationID string) (SelfSubscribeResult, error) {
	if s.emailVerifier == nil {
		return SelfSubscribeResult{}, errors.New("parcours connecté indisponible")
	}
	if strings.TrimSpace(publicationID) == "" {
		return SelfSubscribeResult{}, errors.New("publicationId requis")
	}
	want := strings.ToLower(strings.TrimSpace(email))
	if want == "" || !strings.Contains(want, "@") {
		return SelfSubscribeResult{}, errors.New("adresse email invalide")
	}
	accountEmail, confirmed, err := s.emailVerifier.GetEmailVerification(ctx, userID)
	if err != nil {
		return SelfSubscribeResult{}, err
	}
	if want != accountEmail {
		return SelfSubscribeResult{}, errForbidden
	}
	if !confirmed {
		return SelfSubscribeResult{}, s.subscribePending(ctx, accountEmail, publicationID)
	}
	return SelfSubscribeResult{Active: true}, s.subscribeActive(ctx, userID, accountEmail, publicationID)
}

// subscribePending enregistre une demande en attente et enfile la confirmation
// (même contrat que les voies publiques : jamais d'activation sans clic).
func (s *Service) subscribePending(ctx context.Context, email, publicationID string) error {
	token, err := NewConfirmationToken()
	if err != nil {
		return err
	}
	if err := s.q.SubscribePending(ctx, db.SubscribePendingParams{
		Email:         email,
		PublicationID: publicationID,
		Token:         token,
	}); err != nil {
		return err
	}
	// Budget anti-abus (fiche 06 P0) : comme les deux autres voies, la demande
	// reste enregistrée en attente mais aucun e-mail ne part au-delà du
	// plafond — sans le dire (réponse neutre).
	if !abuse.ConfirmAllowed(ctx, s.budgetPool, email, publicationID, time.Now()) {
		log.Printf("[newsletters] confirmation non envoyée (budget épuisé) %s", email)
		return nil
	}
	if err := queue.PublishSubscriberConfirm(s.ac, queue.SubscriberConfirmPayload{
		Email:         email,
		PublicationID: publicationID,
	}); err != nil {
		log.Printf("[newsletters] subscriber.confirm enqueue: %v", err)
	}
	return nil
}

// subscribeActive active directement un abonnement pour une adresse vérifiée
// (compte connecté + adresse confirmée côté fournisseur). Seul cas où
// `confirmedAt` est posé sans clic sur un lien : la preuve (adresse vérifiée)
// préexiste et l'action est explicite. Rattache aussi l'abonnement au compte.
func (s *Service) subscribeActive(ctx context.Context, userID, email, publicationID string) error {
	uid := pgtype.UUID{}
	if err := uid.Scan(userID); err != nil {
		return err
	}
	if err := s.q.ActivateVerifiedSubscriber(ctx, db.ActivateVerifiedSubscriberParams{
		Email:         email,
		PublicationID: publicationID,
		UserID:        uid,
	}); err != nil {
		return err
	}
	if err := queue.PublishSubscriberWelcome(s.ac, queue.SubscriberWelcomePayload{
		Email:         email,
		PublicationID: publicationID,
	}); err != nil {
		log.Printf("[newsletters] subscriber.welcome enqueue: %v", err)
	}
	return nil
}
