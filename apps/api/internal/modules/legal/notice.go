package legal

// =====================================================================
// 📣 Notice — informer les personnes dont le consentement doit être renouvelé
// =====================================================================
// Publier une nouvelle version d'un document « à accepter » (CGU, confidentialité,
// accord créateur…) crée une obligation : les personnes concernées doivent être
// prévenues et pouvoir refuser (art. 12 RGPD — information effective, art. 7-3
// — retrait du consentement).
//
// On persiste l'avis (`legal_notice`) puis une livraison email par destinataire
// (`legal_notice_delivery`), drainée par le worker `RunLegalNoticeLoop`. Le
// service ne connaît ni SMTP ni Resend : il écrit en base, le worker expire.
// C'est le même découpage que la boîte d'envoi des notifications, pour que la
// publication ne dépende jamais de la disponibilité du fournisseur d'email.
//
// Destinataires : les comptes ayant accepté une AUTRE version du même document.
// On n'arrose pas les inscrits qui n'ont jamais accepté (ils découvrent le
// document au prochain passage via le portail) ni les comptes suspendus.
// =====================================================================

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
)

// NoticeDispatch résume la campagne d'avis créée par une publication.
type NoticeDispatch struct {
	NoticeID   string `json:"noticeId,omitempty"`
	Recipients int    `json:"recipients"`
	Queued     int    `json:"queued"`
	Skipped    bool   `json:"skipped"`
	Reason     string `json:"reason,omitempty"`
}

// LegalNotice est un avis consultable par la console.
type LegalNotice struct {
	ID           string     `json:"id"`
	DocumentID   string     `json:"documentId"`
	DocumentSlug string     `json:"documentSlug"`
	VersionID    string     `json:"versionId"`
	Version      string     `json:"version"`
	Locale       string     `json:"locale"`
	Title        string     `json:"title"`
	Changelog    *string    `json:"changelog,omitempty"`
	PortalPath   string     `json:"portalPath"`
	CreatedAt    *time.Time `json:"createdAt,omitempty"`
	Deliveries   int64      `json:"deliveries"`
	Sent         int64      `json:"sent"`
	Failed       int64      `json:"failed"`
}

// EnqueueNotice crée l'avis et les livraisons email d'une version qui vient
// d'être publiée. Idempotent : republier la même version ne duplique rien.
//
// Retourne nil (sans erreur) quand le document n'exige aucune acceptation :
// il n'y a alors personne à re-consentir, donc rien à annoncer.
func (s *Service) EnqueueNotice(ctx context.Context, actor string, version db.LegalDocumentVersion) (*NoticeDispatch, error) {
	doc, err := s.q.GetLegalDocumentByID(ctx, version.DocumentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	if !doc.RequiresAcceptance {
		return &NoticeDispatch{Skipped: true, Reason: "document sans consentement obligatoire"}, nil
	}

	portalPath := "/legal/" + doc.Slug
	notice, err := s.q.InsertLegalNotice(ctx, db.InsertLegalNoticeParams{
		DocumentID: version.DocumentID,
		VersionID:  version.ID,
		Locale:     NormalizeLocale(version.Locale),
		Version:    version.Version,
		Title:      version.Title,
		Changelog:  version.Changelog,
		PortalPath: portalPath,
		CreatedBy:  toUUID(actor),
	})
	if err != nil {
		return nil, err
	}

	recipients, err := s.q.ListLegalNoticeRecipients(ctx, db.ListLegalNoticeRecipientsParams{
		DocumentID:    version.DocumentID,
		VersionID:     version.ID,
		ExcludeUserID: toUUID(actor),
	})
	if err != nil {
		return nil, err
	}

	queued := 0
	for _, r := range recipients {
		email := strings.TrimSpace(r.Email)
		if email == "" {
			continue
		}
		if err := s.q.InsertLegalNoticeDelivery(ctx, db.InsertLegalNoticeDeliveryParams{
			NoticeID: notice.ID,
			UserID:   r.UserID,
			Email:    email,
		}); err != nil {
			return nil, err
		}
		queued++
	}

	s.audit(ctx, actor, "legal.notice.create", version.DocumentID, map[string]any{
		"noticeId": notice.ID, "versionId": version.ID, "version": version.Version,
		"locale": version.Locale, "recipients": queued,
	})

	return &NoticeDispatch{
		NoticeID:   notice.ID,
		Recipients: len(recipients),
		Queued:     queued,
	}, nil
}

// AdminNotices liste les campagnes d'information (console conformité).
func (s *Service) AdminNotices(ctx context.Context, actor string, limit int32) ([]LegalNotice, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := s.q.ListLegalNoticesAdmin(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]LegalNotice, 0, len(rows))
	for _, r := range rows {
		out = append(out, LegalNotice{
			ID: r.ID, DocumentID: r.DocumentID, DocumentSlug: r.DocumentSlug,
			VersionID: r.VersionID, Version: r.Version, Locale: r.Locale,
			Title: r.Title, Changelog: textPtr(r.Changelog), PortalPath: r.PortalPath,
			CreatedAt:  tsTime(r.CreatedAt),
			Deliveries: r.Deliveries, Sent: r.Sent, Failed: r.Failed,
		})
	}
	return out, nil
}
