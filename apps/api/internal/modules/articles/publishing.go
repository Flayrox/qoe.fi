package articles

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/slug"
)

// SetStatus met à jour l'état (DRAFT/SUBMITTED/PUBLISHED). scheduledAt nil =
// conserver la date existante ; un temps non nul (futur) → statut SCHEDULED.
func (s *Service) SetStatus(ctx context.Context, articleID, userID, status string, published bool, scheduledAt *time.Time) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
	if err != nil {
		return err
	}
	if (published || status == "SCHEDULED") && !mc.can(permissions.PermPublishAny) {
		return errForbidden
	}
	if status == "SCHEDULED" && (scheduledAt == nil || !scheduledAt.After(time.Now())) {
		return errors.New("Une programmation nécessite une date future.")
	}
	newScheduledAt := row.ScheduledAt
	if scheduledAt != nil && !scheduledAt.IsZero() {
		newScheduledAt = pgtype.Timestamp{Time: *scheduledAt, Valid: true}
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: status, Published: published, ScheduledAt: newScheduledAt,
	}); err != nil {
		return err
	}
	if published {
		_, _ = s.q.PublishArticleDraft(ctx, articleID)
		publishedContent := row.Content
		if row.DraftContent.Valid && row.DraftContent.String != "" {
			publishedContent = row.DraftContent.String
		}
		_ = s.captureSnapshot(ctx, articleID, &userID, row.Title, publishedContent, "PUBLISHED")
	} else if status == "SUBMITTED" && row.Status != "SUBMITTED" {
		submittedContent := row.Content
		if row.DraftContent.Valid && row.DraftContent.String != "" {
			submittedContent = row.DraftContent.String
		}
		_ = s.captureSnapshot(ctx, articleID, &userID, row.Title, submittedContent, "SUBMITTED")
	}
	s.queueSearchSync(articleID, "upsert")
	if published {
		s.emitPublished(ctx, row, true, "", "")
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventPublished, FromStatus: statusOrDraft(row.Status), ToStatus: statusOrDraft(status),
		})
	} else if status == "SCHEDULED" && scheduledAt != nil {
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventScheduled, FromStatus: statusOrDraft(row.Status), ToStatus: "SCHEDULED", ScheduledAt: scheduledAt,
		})
	}
	switch {
	case published && !row.Published:
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_published", map[string]any{
			"articleId": articleID, "title": row.Title,
		})
	case status == "SCHEDULED":
		meta := map[string]any{"articleId": articleID, "title": row.Title}
		if scheduledAt != nil {
			meta["scheduledAt"] = scheduledAt.Format(time.RFC3339)
		}
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_scheduled", meta)
	}
	return nil
}

// Unpublish remet un article en ligne en brouillon privé et efface toute
// programmation. Distinct de Update (qui isole les modifications dans
// draftContent) et de Schedule (qui ne touche pas aux articles publiés).
func (s *Service) Unpublish(ctx context.Context, articleID, userID string) error {
	row, mc, err := s.authorizeEdit(ctx, articleID, userID, "")
	if err != nil {
		return err
	}
	// Dépublier est un acte de publication : un co-auteur sans droit de
	// publication ne doit pas pouvoir retirer un article en ligne. Un
	// co-auteur non-membre d'une publication média n'a pas de memberContext
	// (isMedia=false) : on le rejette explicitement.
	if row.Published {
		if pub, err := s.q.GetPublisherTypeByID(ctx, row.PublisherId); err == nil &&
			pub.Type == "MEDIA" && !mc.isMedia {
			return errForbidden
		}
		if !mc.can(permissions.PermPublishAny) {
			return errForbidden
		}
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: "DRAFT", Published: false,
		ScheduledAt: pgtype.Timestamp{Valid: false},
	}); err != nil {
		return err
	}
	if row.Published {
		s.queueSearchSync(articleID, "upsert")
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventUnpublished, FromStatus: statusOrDraft(row.Status), ToStatus: "DRAFT",
		})
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_unpublished", map[string]any{
			"articleId": articleID, "title": row.Title,
		})
	}
	return nil
}

// Schedule programme (ou annule) la publication d'un article : date future →
// statut SCHEDULED ; nil → retour au brouillon (la programmation est levée).
func (s *Service) Schedule(ctx context.Context, articleID, userID string, scheduledAt *time.Time) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
	if err != nil {
		return err
	}
	if scheduledAt == nil {
		// Annulation : uniquement pour un article réellement programmé. Sans
		// cette garde, appeler l'annulation sur un article publié (ou même un
		// brouillon) le forçait à `published = false` : le site perdait
		// silencieusement un article en ligne.
		if row.Status != "SCHEDULED" {
			return nil
		}
		status := "DRAFT"
		if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
			ID: articleID, Status: status, Published: false,
			ScheduledAt: pgtype.Timestamp{Valid: false},
		}); err != nil {
			return err
		}
		s.queueSearchSync(articleID, "upsert")
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventScheduleCancelled, FromStatus: statusOrDraft(row.Status), ToStatus: statusOrDraft(status),
		})
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_schedule_cancelled", map[string]any{
			"articleId": articleID, "title": row.Title,
		})
		return nil
	}
	if !scheduledAt.After(time.Now()) {
		return errors.New("La date de programmation doit être dans le futur.")
	}
	// Programmer un article EN LIGNE le retirerait du site jusqu'à la date
	// choisie (`published = false`), alors que « reporter » ne signifie jamais
	// « dépublier ». Aucune mise à jour programmée n'existe : on refuse, et
	// l'article reste en ligne.
	if row.Published {
		return errAlreadyPublished
	}
	if !mc.can(permissions.PermPublishAny) {
		return errForbidden
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: "SCHEDULED", Published: false,
		ScheduledAt: pgtype.Timestamp{Time: *scheduledAt, Valid: true},
	}); err != nil {
		return err
	}
	s.queueSearchSync(articleID, "upsert")
	// Une date déjà programmée qui change est un report, pas une première
	// programmation : la chronologie doit le dire.
	wasScheduled := row.Status == "SCHEDULED" && row.ScheduledAt.Valid
	eventType := EventScheduled
	if wasScheduled {
		eventType = EventRescheduled
	}
	s.recordEvent(ctx, EventInput{
		ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
		Type: eventType, FromStatus: statusOrDraft(row.Status), ToStatus: "SCHEDULED",
		ScheduledAt: scheduledAt,
	})
	s.auditMedia(ctx, row.PublisherId, userID, "media.article_scheduled", map[string]any{
		"articleId": articleID, "title": row.Title, "scheduledAt": scheduledAt.Format(time.RFC3339),
		"rescheduled": wasScheduled,
	})
	return nil
}

// queueSearchSync enqueue un job de sync Meilisearch.
func (s *Service) queueSearchSync(articleID string, action string) {
	if s.ac == nil {
		return
	}
	_ = queue.PublishSearchSync(s.ac, queue.SearchSyncPayload{ArticleID: articleID, Action: action})
}

// emitPublished enqueue l'événement article.published dans asynq, plus le
// job d'embedding sémantique (jina-embeddings-v3) si le service est branché.
func (s *Service) emitPublished(ctx context.Context, row db.GetArticleByIDRow, sendEmail bool, emailSubject, emailPreviewText string) {
	if s.ac == nil {
		return
	}
	_ = queue.PublishArticleEmbedding(s.ac, queue.EmbeddingPayload{ArticleID: row.ID})
	_ = queue.PublishArticlePublished(s.ac, queue.ArticlePublishedPayload{
		EventID:          "article_published_" + row.ID,
		PublisherID:      row.PublisherId,
		ArticleID:        row.ID,
		AuthorID:         row.AuthorID,
		Title:            row.Title,
		Slug:             row.Slug,
		Visibility:       string(row.Visibility),
		PublishedAt:      time.Now().UTC().Format(time.RFC3339),
		SendEmail:        sendEmail,
		EmailSubject:     emailSubject,
		EmailPreviewText: emailPreviewText,
	})
}

func (s *Service) uniqueSlug(ctx context.Context, publisherID, articleID, base string) string {
	final := base
	if final == "" {
		final = "article-" + slug.ShortID(8)
	}
	exists, err := s.q.CheckArticleSlugExists(ctx, db.CheckArticleSlugExistsParams{
		PublisherId: publisherID, Slug: final, ID: articleID,
	})
	if err == nil && exists {
		// Le code court doit rester le dernier jeton du slug : sinon
		// ExtractTrailingShortCode ne le retrouve plus et le repli de résolution
		// par code (publishers.resolveArticleWithFallbacks) est mort.
		if code := slug.ExtractTrailingShortCode(final); code != "" {
			final = strings.TrimSuffix(final, "-"+code) + "-" + slug.ShortID(4) + "-" + code
		} else {
			final = final + "-" + slug.ShortID(4)
		}
	}
	return final
}

func (s *Service) archiveSlugIfPreviouslyPublished(ctx context.Context, articleID, oldSlug, newSlug string, currentlyPublished bool, currentStatus string) {
	if oldSlug == "" || newSlug == "" || oldSlug == newSlug {
		return
	}
	wasPublished := currentlyPublished || currentStatus == "PUBLISHED"
	if !wasPublished {
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM "ArticleSnapshot"
				WHERE "articleId" = $1 AND reason = 'PUBLISHED'
			)`, articleID).Scan(&wasPublished)
	}
	if !wasPublished {
		return
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO "ArticleSlugHistory" (id, "articleId", slug, "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, now())
		ON CONFLICT (slug) DO NOTHING`,
		articleID, oldSlug)
}

// emitArticleLifecycle enqueue un événement article.{updated,deleted} pour les
// webhooks abonnés (le worker dispatche vers les URLs HMAC-signées).
func (s *Service) emitArticleLifecycle(taskType string, row db.GetArticleByIDRow, title, slug string) {
	if s.ac == nil {
		return
	}
	if title == "" {
		title = row.Title
	}
	if slug == "" {
		slug = row.Slug
	}
	_ = queue.PublishArticleLifecycle(s.ac, taskType, queue.ArticlePublishedPayload{
		EventID:     "article_" + strings.TrimPrefix(taskType, "article.") + "_" + row.ID,
		PublisherID: row.PublisherId,
		ArticleID:   row.ID,
		AuthorID:    row.AuthorID,
		Title:       title,
		Slug:        slug,
		Visibility:  string(row.Visibility),
		PublishedAt: time.Now().UTC().Format(time.RFC3339),
	})
}
