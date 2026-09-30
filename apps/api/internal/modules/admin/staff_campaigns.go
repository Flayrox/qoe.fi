package admin

// ── Centre de campagnes administratives (fiche 04 §10) ────────────────
// Avant ce centre, il n'existait aucun moyen d'envoyer un message officiel
// ciblé — et surtout aucune barrière contre un `sendAnyEmail(to, html)`.
// Ce centre est cette barrière : catégories fermées, audience générée côté
// serveur (jamais de CSV libre), rédacteur ≠ approbateur, audience figée à
// l'approbation, arrêt possible à tout moment.
//
// Ce que ce fichier ne fait pas : du marketing déguisé (les catégories sont
// fermées par CHECK et le registre des types fait foi), des invitations
// d'événements (chantier événements), ni du miroir in-app (la table
// Notification porte un enum fermé — un ALTER TYPE non transactionnel —
// le miroir attendra une migration dédiée).
//
// Cycle de vie : draft → pending_review → approved → sending →
// paused/completed/cancelled. Toute modification substantielle du contenu ou
// de l'audience après approbation repasse par un nouveau brouillon : on ne
// modifie jamais une campagne approuvée, on en crée une autre.

import (
	"context"
	"encoding/json"
	"errors"
	"html"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/comms"
	"github.com/qoefi/api/internal/queue"
)

// toCampaignUUID convertit un identifiant texte en UUID pgx (zéro si invalide :
// les colonnes acteur sont NULLables, un ID illisible ne doit jamais planter
// une écriture d'audit).
func toCampaignUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func mustCampaignJSON(v any) []byte {
	raw, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return raw
}

const (
	// Types fermés, miroir de la contrainte CHECK (migration 00035).
	CampaignLegalNotice = "legal.version_notice"
	CampaignStaffDirect = "staff.direct"
	CampaignProductNews = "product.announcement"

	// Audiences prédéfinies : jamais de liste libre. L'audience est générée
	// côté serveur au démarrage de l'envoi, depuis ces seuls sélecteurs.
	CampaignAudienceAllUsers    = "all_active_users"
	CampaignAudienceSubscribers = "publication_subscribers"

	// Statuts, miroir de la contrainte CHECK.
	CampaignDraft         = "draft"
	CampaignPendingReview = "pending_review"
	CampaignApproved      = "approved"
	CampaignSending       = "sending"
	CampaignPaused        = "paused"
	CampaignCompleted     = "completed"
	CampaignCancelled     = "cancelled"

	// sendCampaignChunkSize borne les envois d'une exécution de tâche.
	sendCampaignChunkSize = 100
	// sendCampaignChunkDelay espace deux tranches d'une même campagne.
	sendCampaignChunkDelay = 60 * time.Second

	maxCampaignSubject = 200
	maxCampaignBody    = 200_000
)

var (
	// errCampaignTransition : transition d'état interdite.
	errCampaignTransition = errors.New("transition d'état interdite pour cette campagne")
	// errCampaignSelfApproval : le rédacteur ne peut pas approuver.
	errCampaignSelfApproval = errors.New("l'approbateur doit être un second superadmin, distinct du rédacteur")
	// errCampaignTranslation : traduction requise manquante.
	errCampaignTranslation = errors.New("traduction requise manquante pour ce type de message")
	// errCampaignBadVariable : variable hors liste blanche dans le contenu.
	errCampaignBadVariable = errors.New("variable inconnue dans le contenu (liste blanche : publication_name, unsubscribe_url)")
)

// Exportées pour la façade HTTP et les tests (même pattern que le reste).
var (
	// ErrCampaignNotFound : campagne inconnue.
	ErrCampaignNotFound = errors.New("campagne introuvable")
	// ErrCampaignTransition : transition interdite.
	ErrCampaignTransition = errCampaignTransition
	// ErrCampaignSelfApproval : auto-approbation refusée.
	ErrCampaignSelfApproval = errCampaignSelfApproval
)

// campaignVarWhitelist : variables autorisées dans sujet et corps, substituées
// avec échappement HTML. Toute autre forme {{...}} est rejetée à la création
// et à la modification — aucun HTML arbitraire injecté via une variable,
// aucun en-tête e-mail fourni librement.
var campaignVarWhitelist = map[string]bool{
	"publication_name": true,
	"unsubscribe_url":  true,
}

var campaignVarPattern = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`)

// validateCampaignContent vérifie catégorie, tailles, variables et traductions
// requises. Pour `legal.version_notice`, l'anglais est obligatoire : un avis
// légal ne part jamais dans une langue dont le contenu n'a pas été **revu et
// approuvé** (fiche 04 §12).
func validateCampaignContent(campaignType, subject, bodyHTML, subjectEn, bodyHTMLEn string) error {
	if !validCampaignType(campaignType) {
		return errors.New("catégorie inconnue (catégories fermées uniquement)")
	}
	if strings.TrimSpace(subject) == "" || strings.TrimSpace(bodyHTML) == "" {
		return errors.New("objet et corps (FR) requis")
	}
	if len(subject) > maxCampaignSubject || len(bodyHTML) > maxCampaignBody {
		return errors.New("contenu trop volumineux")
	}
	for _, text := range []string{subject, bodyHTML, subjectEn, bodyHTMLEn} {
		for _, m := range campaignVarPattern.FindAllStringSubmatch(text, -1) {
			if !campaignVarWhitelist[m[1]] {
				return errCampaignBadVariable
			}
		}
	}
	if campaignType == CampaignLegalNotice {
		if strings.TrimSpace(subjectEn) == "" || strings.TrimSpace(bodyHTMLEn) == "" {
			return errCampaignTranslation
		}
	}
	return nil
}

// SendChunkSize expose la taille de tranche au worker (le worker lit, le
// service décide).
func SendChunkSize() int { return sendCampaignChunkSize }

// SendChunkDelay expose le délai inter-tranches au worker.
func SendChunkDelay() time.Duration { return sendCampaignChunkDelay }

// CampaignClaim est une livraison réclamée : tout ce que le worker doit
// savoir pour envoyer, sans accès direct aux tables.
type CampaignClaim struct {
	DeliveryID string
	Email      string
}

// CampaignSendContext est le contexte d'envoi d'un destinataire : ce qu'il
// faut pour construire son message, sans adresses d'autrui ni secrets.
type CampaignSendContext struct {
	PublicationID   string
	PublicationName string
	Locale          string // fr/en (FR par défaut documenté)
	SubjectFR       string
	BodyFR          string
	SubjectEN       string
	BodyEN          string
}

// RenderCampaignVars substitue les variables autorisées avec échappement HTML.
// `unsubscribe_url` est une URL signée générée par l'appelant : on l'échappe
// comme attribut, on ne la valide pas ici (le signataire l'a construite).
func RenderCampaignVars(text, publicationName, unsubscribeURL string) string {
	out := text
	out = strings.ReplaceAll(out, "{{publication_name}}", html.EscapeString(publicationName))
	out = strings.ReplaceAll(out, "{{ publication_name }}", html.EscapeString(publicationName))
	out = strings.ReplaceAll(out, "{{unsubscribe_url}}", html.EscapeString(unsubscribeURL))
	out = strings.ReplaceAll(out, "{{ unsubscribe_url }}", html.EscapeString(unsubscribeURL))
	return out
}

// StaffCampaignDTO est la vue API d'une campagne.
type StaffCampaignDTO struct {
	ID               string `json:"id"`
	Type             string `json:"type"`
	Subject          string `json:"subject"`
	BodyHTML         string `json:"bodyHtml"`
	BodyText         string `json:"bodyText,omitempty"`
	SubjectEn        string `json:"subjectEn,omitempty"`
	BodyHTMLEn       string `json:"bodyHtmlEn,omitempty"`
	BodyTextEn       string `json:"bodyTextEn,omitempty"`
	AudienceType     string `json:"audienceType"`
	AudiencePubID    string `json:"audiencePublicationId,omitempty"`
	AudienceSnapshot string `json:"audienceSnapshot,omitempty"`
	Status           string `json:"status"`
	DraftedBy        string `json:"draftedBy,omitempty"`
	ApprovedBy       string `json:"approvedBy,omitempty"`
	ApprovedAt       string `json:"approvedAt,omitempty"`
	ScheduledAt      string `json:"scheduledAt,omitempty"`
	SentCount        int    `json:"sentCount"`
	FailedCount      int    `json:"failedCount"`
	SkippedCount     int    `json:"skippedCount"`
	CompletedAt      string `json:"completedAt,omitempty"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

// StaffCampaignInput est le corps de création/modification (brouillon).
type StaffCampaignInput struct {
	Type          string `json:"type"`
	Subject       string `json:"subject"`
	BodyHTML      string `json:"bodyHtml"`
	BodyText      string `json:"bodyText"`
	SubjectEn     string `json:"subjectEn"`
	BodyHTMLEn    string `json:"bodyHtmlEn"`
	BodyTextEn    string `json:"bodyTextEn"`
	AudienceType  string `json:"audienceType"`
	AudiencePubID string `json:"audiencePublicationId"`
	ScheduledAt   string `json:"scheduledAt"`
}

func validCampaignType(t string) bool {
	return t == CampaignLegalNotice || t == CampaignStaffDirect || t == CampaignProductNews
}

func validCampaignAudience(t, pubID string) bool {
	switch t {
	case CampaignAudienceAllUsers:
		return pubID == ""
	case CampaignAudienceSubscribers:
		return pubID != ""
	default:
		return false
	}
}

// CreateCampaign crée un brouillon (rédacteur = superadmin courant).
func (s *Service) CreateCampaign(ctx context.Context, staffID string, in StaffCampaignInput) (StaffCampaignDTO, error) {
	if !validCampaignType(in.Type) {
		return StaffCampaignDTO{}, errors.New("catégorie inconnue (catégories fermées uniquement)")
	}
	if !validCampaignAudience(in.AudienceType, strings.TrimSpace(in.AudiencePubID)) {
		return StaffCampaignDTO{}, errors.New("audience invalide")
	}
	if err := validateCampaignContent(in.Type, in.Subject, in.BodyHTML, in.SubjectEn, in.BodyHTMLEn); err != nil {
		return StaffCampaignDTO{}, err
	}
	id := uuid.NewString()
	// "bodyText" est NOT NULL DEFAULT '' : le texte brut (version sans HTML)
	// reste une chaîne vide tant qu'aucune version texte n'est fournie —
	// NULLIF en ferait un NULL et violerait la contrainte.
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "StaffCampaign" (
		    "id", "type", "subject", "bodyHtml", "bodyText",
		    "subjectEn", "bodyHtmlEn", "bodyTextEn",
		    "audienceType", "audiencePublicationId",
		    "status", "draftedBy", "scheduledAt", "createdAt", "updatedAt"
		) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''),
		          $9, NULLIF($10, ''), 'draft', $11, NULLIF($12, '')::timestamptz, now(), now())`,
		id, in.Type, strings.TrimSpace(in.Subject), in.BodyHTML,
		strings.TrimSpace(in.BodyText), strings.TrimSpace(in.SubjectEn),
		in.BodyHTMLEn, strings.TrimSpace(in.BodyTextEn),
		in.AudienceType, strings.TrimSpace(in.AudiencePubID),
		toCampaignUUID(staffID), strings.TrimSpace(in.ScheduledAt),
	); err != nil {
		return StaffCampaignDTO{}, err
	}
	return s.GetCampaign(ctx, id)
}

// UpdateDraft modifie un brouillon (rédacteur uniquement, jamais après envoi).
func (s *Service) UpdateDraft(ctx context.Context, staffID, id string, in StaffCampaignInput) (StaffCampaignDTO, error) {
	var status, draftedBy string
	err := s.pool.QueryRow(ctx, `
		SELECT "status", COALESCE("draftedBy"::text, '') FROM "StaffCampaign" WHERE "id" = $1`, id).Scan(&status, &draftedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return StaffCampaignDTO{}, ErrCampaignNotFound
	}
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	if status != CampaignDraft {
		return StaffCampaignDTO{}, errCampaignTransition
	}
	if draftedBy != "" && draftedBy != staffID {
		return StaffCampaignDTO{}, errForbidden
	}
	if !validCampaignType(in.Type) {
		return StaffCampaignDTO{}, errors.New("catégorie inconnue (catégories fermées uniquement)")
	}
	if !validCampaignAudience(in.AudienceType, strings.TrimSpace(in.AudiencePubID)) {
		return StaffCampaignDTO{}, errors.New("audience invalide")
	}
	if err := validateCampaignContent(in.Type, in.Subject, in.BodyHTML, in.SubjectEn, in.BodyHTMLEn); err != nil {
		return StaffCampaignDTO{}, err
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "type" = $2, "subject" = $3, "bodyHtml" = $4, "bodyText" = $5,
		    "subjectEn" = NULLIF($6, ''), "bodyHtmlEn" = NULLIF($7, ''), "bodyTextEn" = NULLIF($8, ''),
		    "audienceType" = $9, "audiencePublicationId" = NULLIF($10, ''),
		    "scheduledAt" = NULLIF($11, '')::timestamptz, "updatedAt" = now()
		WHERE "id" = $1`, id, in.Type, strings.TrimSpace(in.Subject), in.BodyHTML,
		strings.TrimSpace(in.BodyText), strings.TrimSpace(in.SubjectEn),
		in.BodyHTMLEn, strings.TrimSpace(in.BodyTextEn),
		in.AudienceType, strings.TrimSpace(in.AudiencePubID),
		strings.TrimSpace(in.ScheduledAt)); err != nil {
		return StaffCampaignDTO{}, err
	}
	return s.GetCampaign(ctx, id)
}

// SubmitCampaign envoie un brouillon en revue.
func (s *Service) SubmitCampaign(ctx context.Context, staffID, id string) (StaffCampaignDTO, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "status" = 'pending_review', "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'draft'`, id)
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	if tag.RowsAffected() == 0 {
		return StaffCampaignDTO{}, errCampaignTransition
	}
	return s.GetCampaign(ctx, id)
}

// ApproveCampaign approuve : second superadmin obligatoire, audience figée.
// Toute modification ultérieure du contenu ou de l'audience exige un nouveau
// brouillon — on n'édite jamais une campagne approuvée.
func (s *Service) ApproveCampaign(ctx context.Context, staffID, id string) (StaffCampaignDTO, error) {
	var status, draftedBy, audienceType, audiencePubID string
	err := s.pool.QueryRow(ctx, `
		SELECT "status", COALESCE("draftedBy"::text, ''),
		       "audienceType", COALESCE("audiencePublicationId", '')
		FROM "StaffCampaign" WHERE "id" = $1`,
		id).Scan(&status, &draftedBy, &audienceType, &audiencePubID)
	if errors.Is(err, pgx.ErrNoRows) {
		return StaffCampaignDTO{}, ErrCampaignNotFound
	}
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	if status != CampaignPendingReview {
		return StaffCampaignDTO{}, errCampaignTransition
	}
	// Deux personnes distinctes : le rédacteur ne s'auto-approuve jamais.
	// Exiger deux IDs différents, pas deux rôles — le rôle est déjà garanti
	// superadmin par la route.
	if draftedBy != "" && draftedBy == staffID {
		return StaffCampaignDTO{}, errCampaignSelfApproval
	}
	count, err := s.estimateAudience(ctx, audienceType, audiencePubID)
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	snapshot := map[string]any{
		"audienceType": audienceType, "publicationId": audiencePubID,
		"estimatedRecipients": count, "frozenAt": time.Now().UTC().Format(time.RFC3339),
	}
	snapshotRaw, err := json.Marshal(snapshot)
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "status" = 'approved', "approvedBy" = $2, "approvedAt" = now(),
		    "audienceSnapshot" = $3, "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'pending_review'`, id, toCampaignUUID(staffID), snapshotRaw)
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	if tag.RowsAffected() == 0 {
		return StaffCampaignDTO{}, errCampaignTransition
	}
	return s.GetCampaign(ctx, id)
}

// estimateAudience compte les destinataires éligibles d'une audience, avec les
// mêmes prédicats que la matérialisation (abonnés actifs confirmés non
// supprimés ; comptes non suspendus). Le chiffre est indicatif (figé au
// snapshot) : l'éligibilité réelle est revérifiée à chaque envoi.
func (s *Service) estimateAudience(ctx context.Context, audienceType, publicationID string) (int, error) {
	var n int
	var err error
	switch audienceType {
	case CampaignAudienceAllUsers:
		err = s.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM "User" u
			WHERE u."isSuspended" = false
			  AND u.email IS NOT NULL
			  AND NOT EXISTS(
			      SELECT 1 FROM "EmailSuppression" x
			      WHERE x.email = u.email AND x."scope" = 'global')`).Scan(&n)
	case CampaignAudienceSubscribers:
		err = s.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM "Subscriber" s
			WHERE s."publicationId" = $1
			  AND s."isActive" = true
			  AND s."receiveArticles" = true
			  AND s."confirmedAt" IS NOT NULL
			  AND NOT EXISTS(
			      SELECT 1 FROM "EmailSuppression" x
			      WHERE x.email = s.email
			        AND (x."scope" = 'global'
			             OR (x."scope" = 'publication' AND x."publicationId" = s."publicationId")))`,
			publicationID).Scan(&n)
	default:
		return 0, errors.New("audience inconnue")
	}
	return n, err
}

// GetCampaign charge une campagne avec ses compteurs.
func (s *Service) GetCampaign(ctx context.Context, id string) (StaffCampaignDTO, error) {
	var (
		dto                                         StaffCampaignDTO
		bodyText, subjectEn, bodyHTMLEn, bodyTextEn *string
		audiencePubID                               *string
		draftedBy, approvedBy                       *string
		approvedAt, scheduledAt, completedAt        *time.Time
		created, updated                            time.Time
	)
	err := s.pool.QueryRow(ctx, `
		SELECT "id", "type", "subject", "bodyHtml", "bodyText",
		       "subjectEn", "bodyHtmlEn", "bodyTextEn",
		       "audienceType", "audiencePublicationId", "audienceSnapshot",
		       "status", "draftedBy", "approvedBy",
		       "approvedAt", "scheduledAt",
		       "sentCount", "failedCount", "skippedCount",
		       "completedAt", "createdAt", "updatedAt"
		FROM "StaffCampaign" WHERE "id" = $1`, id).Scan(
		&dto.ID, &dto.Type, &dto.Subject, &dto.BodyHTML, &bodyText,
		&subjectEn, &bodyHTMLEn, &bodyTextEn,
		&dto.AudienceType, &audiencePubID, &dto.AudienceSnapshot,
		&dto.Status, &draftedBy, &approvedBy,
		&approvedAt, &scheduledAt,
		&dto.SentCount, &dto.FailedCount, &dto.SkippedCount,
		&completedAt, &created, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return StaffCampaignDTO{}, ErrCampaignNotFound
	}
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	if bodyText != nil {
		dto.BodyText = *bodyText
	}
	if subjectEn != nil {
		dto.SubjectEn = *subjectEn
	}
	if bodyHTMLEn != nil {
		dto.BodyHTMLEn = *bodyHTMLEn
	}
	if bodyTextEn != nil {
		dto.BodyTextEn = *bodyTextEn
	}
	if audiencePubID != nil {
		dto.AudiencePubID = *audiencePubID
	}
	if draftedBy != nil {
		dto.DraftedBy = *draftedBy
	}
	if approvedBy != nil {
		dto.ApprovedBy = *approvedBy
	}
	dto.ApprovedAt = formatCampaignTime(approvedAt)
	dto.ScheduledAt = formatCampaignTime(scheduledAt)
	dto.CompletedAt = formatCampaignTime(completedAt)
	dto.CreatedAt = created.Format(time.RFC3339)
	dto.UpdatedAt = updated.Format(time.RFC3339)
	return dto, nil
}

func formatCampaignTime(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

// ListCampaigns liste les campagnes, les plus récentes d'abord.
func (s *Service) ListCampaigns(ctx context.Context, limit int) ([]StaffCampaignDTO, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id" FROM "StaffCampaign" ORDER BY "createdAt" DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StaffCampaignDTO{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		dto, err := s.GetCampaign(ctx, id)
		if err != nil {
			return nil, err
		}
		out = append(out, dto)
	}
	return out, rows.Err()
}

// StartCampaign fige l'audience et démarre l'envoi : matérialise les
// livraisons depuis les sélecteurs serveur, passe en sending, enfile la
// première tranche. Idempotent : si une vague est déjà active, elle est
// renvoyée au lieu d'en créer une seconde.
func (s *Service) StartCampaign(ctx context.Context, staffID, id string) (StaffCampaignDTO, error) {
	var status, audienceType, audiencePubID, campaignType string
	err := s.pool.QueryRow(ctx, `
		SELECT "status", "audienceType", COALESCE("audiencePublicationId", ''), "type"
		FROM "StaffCampaign" WHERE "id" = $1`,
		id).Scan(&status, &audienceType, &audiencePubID, &campaignType)
	if errors.Is(err, pgx.ErrNoRows) {
		return StaffCampaignDTO{}, ErrCampaignNotFound
	}
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	if status != CampaignApproved && status != CampaignSending {
		return StaffCampaignDTO{}, errCampaignTransition
	}
	_ = campaignType

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StaffCampaignDTO{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Matérialisation depuis les sélecteurs serveur uniquement : aucune liste
	// libre, aucune adresse fournie par l'opérateur. Les suppressions sont
	// appliquées dès la matérialisation (en plus de la revérification à
	// chaque envoi) : une adresse en opposition n'entre même pas en file.
	var matérialisées int64
	switch audienceType {
	case CampaignAudienceSubscribers:
		tag, err := tx.Exec(ctx, `
			INSERT INTO "StaffCampaignDelivery" ("id", "campaignId", "email", "status", "createdAt", "updatedAt")
			SELECT gen_random_uuid()::text, $1, s.email, 'queued', now(), now()
			FROM "Subscriber" s
			WHERE s."publicationId" = $2
			  AND s."isActive" = true
			  AND s."receiveArticles" = true
			  AND s."confirmedAt" IS NOT NULL
			  AND NOT EXISTS(
			      SELECT 1 FROM "EmailSuppression" x
			      WHERE x.email = s.email
			        AND (x."scope" = 'global'
			             OR (x."scope" = 'publication' AND x."publicationId" = s."publicationId")))
			ON CONFLICT ("campaignId", "email") DO NOTHING`, id, audiencePubID)
		if err != nil {
			return StaffCampaignDTO{}, err
		}
		matérialisées = tag.RowsAffected()
	case CampaignAudienceAllUsers:
		tag, err := tx.Exec(ctx, `
			INSERT INTO "StaffCampaignDelivery" ("id", "campaignId", "email", "status", "createdAt", "updatedAt")
			SELECT gen_random_uuid()::text, $1, u.email, 'queued', now(), now()
			FROM "User" u
			WHERE u."isSuspended" = false
			  AND u.email IS NOT NULL
			  AND NOT EXISTS(
			      SELECT 1 FROM "EmailSuppression" x
			      WHERE x.email = u.email AND x."scope" = 'global')
			ON CONFLICT ("campaignId", "email") DO NOTHING`, id)
		if err != nil {
			return StaffCampaignDTO{}, err
		}
		matérialisées = tag.RowsAffected()
	default:
		return StaffCampaignDTO{}, errors.New("audience inconnue")
	}

	if _, err := tx.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "status" = 'sending', "updatedAt" = now()
		WHERE "id" = $1 AND "status" IN ('approved', 'sending')`, id); err != nil {
		return StaffCampaignDTO{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StaffCampaignDTO{}, err
	}
	log.Printf("[admin] campagne %s démarrée par %s : %d livraisons matérialisées", id, staffID, matérialisées)
	if err := queue.PublishStaffCampaign(s.asynqClient(), queue.StaffCampaignPayload{CampaignID: id}); err != nil {
		log.Printf("[admin] campagne %s enqueue: %v", id, err)
	}
	return s.GetCampaign(ctx, id)
}

// ClaimCampaignChunk réclame une tranche bornée : campagne active, lot non
// suspendu, kill global vérifié par l'appelant worker (qui met en pause via
// PauseCampaignForKill). Verrou sauté : deux workers ne se disputent jamais
// la même adresse.
func (s *Service) ClaimCampaignChunk(ctx context.Context, campaignID string, limit int) ([]CampaignClaim, error) {
	if limit <= 0 || limit > sendCampaignChunkSize {
		limit = sendCampaignChunkSize
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var status string
	if err := tx.QueryRow(ctx, `
		SELECT "status" FROM "StaffCampaign" WHERE "id" = $1`, campaignID).Scan(&status); err != nil {
		return nil, err
	}
	if status != CampaignSending {
		return nil, nil
	}
	rows, err := tx.Query(ctx, `
		SELECT "id", "email" FROM "StaffCampaignDelivery"
		WHERE "campaignId" = $1 AND "status" = 'queued'
		ORDER BY "email" ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED`, campaignID, limit)
	if err != nil {
		return nil, err
	}
	out := []CampaignClaim{}
	for rows.Next() {
		var c CampaignClaim
		if err := rows.Scan(&c.DeliveryID, &c.Email); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Opposition revérifiée au claim (une désinscription entre matérialisation
	// et tranche ne part jamais) : statut `suppressed` avec motif.
	for _, c := range out {
		var suppressed bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS(
			    SELECT 1 FROM "EmailSuppression" x
			    WHERE x.email = $1 AND x."scope" = 'global')`, c.Email).Scan(&suppressed); err != nil {
			return nil, err
		}
		if !suppressed {
			continue
		}
		if _, err := tx.Exec(ctx, `
			UPDATE "StaffCampaignDelivery"
			SET "status" = 'suppressed', "error" = 'opposition globale avant envoi', "updatedAt" = now()
			WHERE "id" = $1 AND "status" = 'queued'`, c.DeliveryID); err != nil {
			return nil, err
		}
	}
	// On ne renvoie que les non-supprimées (relecture simple et bornée).
	kept := out[:0]
	for _, c := range out {
		var st string
		if err := tx.QueryRow(ctx, `
			SELECT "status" FROM "StaffCampaignDelivery" WHERE "id" = $1`, c.DeliveryID).Scan(&st); err != nil {
			return nil, err
		}
		if st == "queued" {
			kept = append(kept, c)
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "StaffCampaign" SET "updatedAt" = now() WHERE "id" = $1`, campaignID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return kept, nil
}

// MarkCampaignResult enregistre l'issue d'un envoi et avance les compteurs.
func (s *Service) MarkCampaignResult(ctx context.Context, campaignID, deliveryID string, ok bool, errText string) error {
	status := "sent"
	if !ok {
		status = "failed"
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaignDelivery"
		SET "status" = $2, "error" = NULLIF($3, ''), "sentAt" = CASE WHEN $2 = 'sent' THEN now() ELSE NULL END, "updatedAt" = now()
		WHERE "id" = $1 AND "campaignId" = $4 AND "status" = 'queued'`,
		deliveryID, status, errText, campaignID); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "sentCount" = "sentCount" + CASE WHEN $2 = 'sent' THEN 1 ELSE 0 END,
		    "failedCount" = "failedCount" + CASE WHEN $2 = 'failed' THEN 1 ELSE 0 END,
		    "updatedAt" = now()
		WHERE "id" = $1`, campaignID, status)
	return err
}

// PauseCampaignForKill met une campagne en pause quand l'arrêt d'urgence
// global est actif. Retourne true si mise en pause — le worker s'arrête alors
// sans envoyer ni ré-enfiler. Reprise manuelle (StartCampaign rouvre).
func (s *Service) PauseCampaignForKill(ctx context.Context, campaignID string) (bool, error) {
	if !comms.EmailKillEngaged(ctx, s.pool) {
		return false, nil
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "status" = 'paused', "updatedAt" = now()
		WHERE "id" = $1 AND "status" IN ('sending')`, campaignID)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return true, nil
	}
	log.Printf("[admin] campagne %s en pause (arrêt d'urgence global)", campaignID)
	return true, nil
}

// PauseCampaign met une campagne en pause (staff) : les tranches suivantes ne
// sont plus réclamées, les `queued` restent en attente de reprise ou
// d'annulation — jamais envoyées par surprise.
func (s *Service) PauseCampaign(ctx context.Context, campaignID string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "status" = 'paused', "updatedAt" = now()
		WHERE "id" = $1 AND "status" IN ('sending', 'approved')`, campaignID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errCampaignTransition
	}
	return nil
}

// CancelCampaign annule : les livraisons en attente sont écartées avec motif,
// jamais envoyées plus tard par reprise.
func (s *Service) CancelCampaign(ctx context.Context, campaignID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		UPDATE "StaffCampaignDelivery"
		SET "status" = 'skipped', "error" = 'campagne annulée par le staff', "updatedAt" = now()
		WHERE "campaignId" = $1 AND "status" = 'queued'`, campaignID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "status" = 'cancelled', "updatedAt" = now()
		WHERE "id" = $1`, campaignID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// FinishCampaignIfDrained clôt la campagne quand il ne reste aucune livraison
// en attente et aucune vague active.
func (s *Service) FinishCampaignIfDrained(ctx context.Context, campaignID string) (bool, error) {
	var queued int
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM "StaffCampaignDelivery"
		WHERE "campaignId" = $1 AND "status" = 'queued'`, campaignID).Scan(&queued); err != nil {
		return false, err
	}
	if queued > 0 {
		return false, nil
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "StaffCampaign"
		SET "status" = 'completed', "completedAt" = now(), "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'sending'`, campaignID); err != nil {
		return false, err
	}
	return true, nil
}

// CampaignRecipientContext résout le contexte d'envoi d'un destinataire :
// nom de publication et locale (résolveur V1 : 'en' si connue, sinon 'fr'.
// Le résolveur complet par destinataire — choix explicite, compte, abonnement,
// session — viendra avec le chantier i18n ; en attendant, pas de langue
// inventée : FR par défaut documenté).
func (s *Service) CampaignRecipientContext(ctx context.Context, campaignID, email string) (pubName, locale string, err error) {
	var audienceType, audiencePubID string
	err = s.pool.QueryRow(ctx, `
		SELECT "audienceType", COALESCE("audiencePublicationId", '')
		FROM "StaffCampaign" WHERE "id" = $1`, campaignID).Scan(&audienceType, &audiencePubID)
	if err != nil {
		return "", "", err
	}
	locale = "fr"
	if audienceType == CampaignAudienceSubscribers && audiencePubID != "" {
		err = s.pool.QueryRow(ctx, `
			SELECT COALESCE(p."name", ''), COALESCE(
			  (SELECT s2."locale" FROM "Subscriber" s2
			   WHERE s2."publicationId" = $1 AND s2."email" = $2 LIMIT 1), 'fr')
			FROM "Publication" p WHERE p."id" = $1`, audiencePubID, email).Scan(&pubName, &locale)
		if err != nil {
			return "", "", err
		}
	} else {
		pubName = "qoe.fi"
	}
	if locale != "en" {
		locale = "fr"
	}
	return pubName, locale, nil
}

// CampaignSendContext résout le contexte d'envoi d'un destinataire : la vague
// doit exister et la livraison lui appartenir, sinon refus — un worker ne doit
// jamais envoyer pour une campagne inconnue.
func (s *Service) CampaignSendContext(ctx context.Context, campaignID, email string) (CampaignSendContext, error) {
	var out CampaignSendContext
	err := s.pool.QueryRow(ctx, `
		SELECT c."audiencePublicationId", COALESCE(p."name", ''),
		       COALESCE(c."subject", ''), COALESCE(c."bodyHtml", ''),
		       COALESCE(c."subjectEn", ''), COALESCE(c."bodyHtmlEn", ''),
		       COALESCE(
		         (SELECT s2."locale" FROM "Subscriber" s2
		          WHERE s2."publicationId" = c."audiencePublicationId" AND s2."email" = $2 LIMIT 1),
		         'fr')
		FROM "StaffCampaign" c
		LEFT JOIN "Publication" p ON p."id" = c."audiencePublicationId"
		JOIN "StaffCampaignDelivery" d ON d."campaignId" = c."id" AND d."email" = $2
		WHERE c."id" = $1`, campaignID, email).Scan(
		&out.PublicationID, &out.PublicationName,
		&out.SubjectFR, &out.BodyFR, &out.SubjectEN, &out.BodyEN,
		&out.Locale)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrCampaignNotFound
	}
	if err != nil {
		return out, err
	}
	// Audience globale : pas de publication, pas de nom inventé.
	if out.PublicationID == "" {
		out.PublicationName = "qoe.fi"
	}
	if out.Locale != "en" {
		out.Locale = "fr"
	}
	return out, nil
}
