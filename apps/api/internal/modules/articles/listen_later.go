package articles

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/subscriptions"
)

// ErrOfflineForbidden : pack ou file refusés. Toujours WRAPPÉE dans une
// sentinelle précise (le handler mappe en 403 + code stable — le front
// branche sur code, jamais sur libellé).
var ErrOfflineForbidden = errors.New("hors-ligne indisponible")

// Causes précises (wrappent ErrOfflineForbidden — errors.Is reste vrai) :
var (
	// ErrOfflinePlusRequired : pas de Plus (ni octroi ni studio).
	ErrOfflinePlusRequired = fmt.Errorf("%w : Plus requis", ErrOfflineForbidden)
	// ErrOfflineNotDownloadable : droit auteur refusé.
	ErrOfflineNotDownloadable = fmt.Errorf("%w : téléchargement refusé par l'auteur", ErrOfflineForbidden)
	// ErrOfflineNotPublished : brouillon (jamais de brouillon hors-ligne).
	ErrOfflineNotPublished = fmt.Errorf("%w : non publié", ErrOfflineForbidden)
)

// OfflinePack est un article prêt à mettre en cache (hors-ligne/TTS) :
// contenu coupé au paywall comme la lecture (jamais de contournement),
// droits constatés. Versionnée (v1) pour les évolutions de format.
type OfflinePack struct {
	Version      string `json:"version"`
	ID           string `json:"id"`
	Title        string `json:"title"`
	Slug         string `json:"slug"`
	Content      string `json:"content"`
	ReadingTime  int    `json:"readingTime"`
	AuthorName   string `json:"authorName"`
	PublisherID  string `json:"publisherId"`
	Publisher    string `json:"publisher"`
	PublishedAt  string `json:"publishedAt"`
	Downloadable bool   `json:"downloadable"`
}

// ListenItem est une entrée de file d'écoute (métadonnées pour le player).
type ListenItem struct {
	ID        string `json:"id"`
	ArticleID string `json:"articleId"`
	Title     string `json:"title"`
	Position  int    `json:"position"`
	CreatedAt string `json:"createdAt"`
}

// SetAllowDownload bascule le droit de téléchargement d'un article
// (hors-ligne et file d'écoute vérifient). Même garde qu'Update
// (authorizeEdit) : seul qui peut éditer peut restreindre.
func (s *Service) SetAllowDownload(ctx context.Context, articleID, userID string, allow bool) (bool, error) {
	if _, _, err := s.authorizeEdit(ctx, articleID, userID, ""); err != nil {
		return false, err
	}
	row, err := s.q.SetArticleAllowDownload(ctx, db.SetArticleAllowDownloadParams{
		ID:            articleID,
		AllowDownload: allow,
	})
	if err != nil {
		return false, err
	}
	return row.AllowDownload, nil
}

// OfflinePack assemble le pack (auth + Plus + publié + droit auteur +
// paywall). Authentifié requis (userID non vide) — le hors-ligne anonyme
// n'existe pas (pas de cache sans compte à qui le rattacher).
func (s *Service) OfflinePack(ctx context.Context, articleID, userID, viewerEmail string) (OfflinePack, error) {
	if userID == "" {
		return OfflinePack{}, fmt.Errorf("%w : compte requis", ErrOfflineForbidden)
	}
	if !subscriptions.HasPlus(ctx, s.pool, userID, time.Now()) {
		return OfflinePack{}, ErrOfflinePlusRequired
	}
	row, err := s.q.GetArticleOfflinePack(ctx, articleID)
	if err != nil {
		return OfflinePack{}, errNotFound
	}
	if !row.Published {
		return OfflinePack{}, ErrOfflineNotPublished
	}
	if !row.AllowDownload {
		return OfflinePack{}, ErrOfflineNotDownloadable
	}
	// Paywall contenu : mêmes entitlements que la lecture (le hors-ligne ne
	// contourne jamais — un premium non acheté sort coupé, comme à l'écran).
	ent := UserEntitlements{}
	sub, err := s.q.GetSubscriberEntitlement(ctx, db.GetSubscriberEntitlementParams{
		PublisherId: row.PublisherId, UserId: toUUID(userID), Email: viewerEmail,
	})
	if err == nil {
		ent.IsMember = sub.IsActive
		ent.IsPaidSubscriber = sub.IsPremium && sub.IsActive
		if sub.TierId.Valid {
			t := sub.TierId.String
			ent.TierID = &t
		}
	}
	cut := SliceContentAtPaywall(row.Content, ent, string(row.Visibility), textPtr(row.TierId))
	content := cut.Content
	var publishedAt string
	if row.CreatedAt.Valid {
		publishedAt = row.CreatedAt.Time.UTC().Format(time.RFC3339)
	}
	return OfflinePack{
		Version: "v1", ID: row.ID, Title: row.Title, Slug: row.Slug, Content: content,
		ReadingTime: int(row.ReadingTime), AuthorName: row.AuthorName.String,
		PublisherID: row.PublisherId, Publisher: row.PublisherName,
		PublishedAt: publishedAt, Downloadable: true,
	}, nil
}

// AddListenLater ajoute un article en fin de file (idempotent : deux fois =
// no-op). Vérifie le droit de téléchargement (la file sert le hors-ligne
// et le TTS — jamais de contenu interdit dedans) mais PAS le palier Plus
// (ajouter à sa file est gratuit — c'est le TÉLÉCHARGEMENT qui est Plus).
func (s *Service) AddListenLater(ctx context.Context, userID, articleID string) (string, error) {
	if userID == "" {
		return "", errForbidden
	}
	row, err := s.q.GetArticleOfflinePack(ctx, articleID)
	if err != nil {
		return "", errNotFound
	}
	if !row.Published || !row.AllowDownload {
		return "", ErrOfflineNotDownloadable
	}
	id, err := s.q.AddListenLater(ctx, db.AddListenLaterParams{
		UserID: toUUID(userID), ArticleID: articleID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Conflit (déjà en file) : no-op, retourne l'existant.
			var existing string
			if err2 := s.pool.QueryRow(ctx,
				`SELECT id FROM "ListenLater" WHERE "userId" = $1 AND "articleId" = $2`,
				toUUID(userID), articleID).Scan(&existing); err2 != nil {
				return "", err
			}
			return existing, nil
		}
		return "", err
	}
	return id, nil
}

// ListListenLater renvoie la file ordonnée (avec titres pour le player).
func (s *Service) ListListenLater(ctx context.Context, userID string) ([]ListenItem, error) {
	rows, err := s.q.ListListenLater(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	items := make([]ListenItem, 0, len(rows))
	for _, r := range rows {
		var title string
		var createdAt pgtype.Timestamp
		_ = s.pool.QueryRow(ctx,
			`SELECT title, "createdAt" FROM "Article" WHERE id = $1`, r.ArticleId).Scan(&title, &createdAt)
		at := ""
		if createdAt.Valid {
			at = createdAt.Time.UTC().Format(time.RFC3339)
		}
		items = append(items, ListenItem{
			ID: r.ID, ArticleID: r.ArticleId, Title: title,
			Position: int(r.Position), CreatedAt: at,
		})
	}
	return items, nil
}

// RemoveListenLater retire un article de la file (inexistant = no-op, pas
// d'erreur — idempotent comme l'ajout).
func (s *Service) RemoveListenLater(ctx context.Context, userID, articleID string) error {
	_, err := s.q.RemoveListenLater(ctx, db.RemoveListenLaterParams{
		UserID: toUUID(userID), ArticleID: articleID,
	})
	return err
}
