package articles

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/permissions"
)

type ArticleSnapshotItem struct {
	ID            string  `json:"id"`
	ArticleID     string  `json:"articleId"`
	ActorID       *string `json:"actorId,omitempty"`
	ActorName     *string `json:"actorName,omitempty"`
	ActorUsername *string `json:"actorUsername,omitempty"`
	ActorAvatar   *string `json:"actorAvatar,omitempty"`
	Title         string  `json:"title"`
	Content       string  `json:"content"`
	WordCount     int     `json:"wordCount"`
	Reason        string  `json:"reason"`
	CreatedAt     string  `json:"createdAt"`
}

const (
	authorSwitchSnapshotCooldown = 5 * time.Minute
	maxNonMilestoneSnapshots     = 50
)

func countWords(content string) int {
	return len(strings.Fields(content))
}

func snapshotContentHash(title, content string) string {
	sum := sha256.Sum256([]byte(title + "\x00" + content))
	return hex.EncodeToString(sum[:])
}

func isMilestoneSnapshotReason(reason string) bool {
	return reason == "INITIAL" || reason == "PUBLISHED" || reason == "BEFORE_REVOCATION"
}

func (s *Service) fetchOriginPublisher(ctx context.Context, originArticleID string) *PublisherInfo {
	if s.pool == nil || originArticleID == "" {
		return nil
	}
	var pubID, name, slug, ptype string
	var sub, logo, custom pgtype.Text
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.name, p.slug, p.subdomain, p."logoUrl", p."customDomain", p.type::text
		FROM "Article" a
		JOIN "Publisher" p ON p.id = a."publisherId"
		WHERE a.id = $1
	`, originArticleID).Scan(&pubID, &name, &slug, &sub, &logo, &custom, &ptype)
	if err != nil {
		return nil
	}
	return &PublisherInfo{
		ID:           pubID,
		Name:         name,
		Slug:         slug,
		Subdomain:    textPtr(sub),
		LogoURL:      textPtr(logo),
		CustomDomain: textPtr(custom),
		Type:         identity.FromPublisherType(ptype),
	}
}

func (s *Service) captureSnapshot(ctx context.Context, articleID string, actorID *string, title, content, reason string) error {
	if s.pool == nil || articleID == "" {
		return nil
	}
	contentHash := snapshotContentHash(title, content)

	// Cooldown anti-flood sur AUTHOR_SWITCH (éditions collaboratives alternées rapides).
	if reason == "AUTHOR_SWITCH" {
		if lastSwitch, err := s.q.GetLatestArticleSnapshotByReason(ctx, db.GetLatestArticleSnapshotByReasonParams{
			ArticleId: articleID,
			Reason:    "AUTHOR_SWITCH",
		}); err == nil && lastSwitch.CreatedAt.Valid && time.Since(lastSwitch.CreatedAt.Time) < authorSwitchSnapshotCooldown {
			return nil
		}
	}

	// Déduplication SHA-256 : évite de dupliquer des snapshots identiques.
	// Les jalons (INITIAL, PUBLISHED, BEFORE_REVOCATION) ne sont dédupliqués
	// que contre un jalon de même raison.
	if latest, err := s.q.GetLatestArticleSnapshotMeta(ctx, articleID); err == nil && latest.ContentHash.Valid && latest.ContentHash.String == contentHash {
		if !isMilestoneSnapshotReason(reason) || latest.Reason == reason {
			return nil
		}
	}

	var actorUUID pgtype.UUID
	if actorID != nil && *actorID != "" {
		actorUUID = toUUID(*actorID)
	}
	words := countWords(content)
	_, err := s.q.InsertArticleSnapshot(ctx, db.InsertArticleSnapshotParams{
		ArticleId:   articleID,
		ActorId:     actorUUID,
		Title:       title,
		Content:     content,
		WordCount:   int32(words),
		Reason:      reason,
		ContentHash: pgtype.Text{String: contentHash, Valid: true},
	})
	if err != nil {
		return err
	}
	if !isMilestoneSnapshotReason(reason) {
		_ = s.q.PruneOldArticleSnapshots(ctx, db.PruneOldArticleSnapshotsParams{
			ArticleId: articleID,
			Limit:     maxNonMilestoneSnapshots,
		})
	}
	return nil
}

// ensureAuthorSovereignCopy est le point d'entrée du fork manuel (« Récupérer
// ma copie »). Le provisionnement automatique à la soumission/publication est
// garanti atomiquement par le trigger SQL trg_provision_author_sovereign_copy,
// qui appelle la même fonction ensure_author_sovereign_copy en base : une
// publication ne peut plus réussir sans copie souveraine.
func (s *Service) ensureAuthorSovereignCopy(ctx context.Context, mediaArticleID, targetUserID string, claimNow bool, overrideTitle, overrideContent *string) (string, bool, error) {
	if s.pool == nil || mediaArticleID == "" || targetUserID == "" {
		return "", false, errors.New("provisionnement de la copie souveraine impossible")
	}
	var alreadyExisted bool
	if existing, err := s.q.GetSovereignCopyByOriginAndAuthor(ctx, db.GetSovereignCopyByOriginAndAuthorParams{
		OriginArticleId: pgtype.Text{String: mediaArticleID, Valid: true},
		AuthorId:        toUUID(targetUserID),
	}); err == nil && existing.ID != "" {
		alreadyExisted = true
	}

	var copyID pgtype.Text
	if err := s.pool.QueryRow(ctx,
		`SELECT ensure_author_sovereign_copy($1, $2, $3, $4, $5)`,
		mediaArticleID, toUUID(targetUserID), claimNow, overrideTitle, overrideContent,
	).Scan(&copyID); err != nil {
		return "", false, err
	}
	if !copyID.Valid || copyID.String == "" {
		return "", false, errors.New("la copie souveraine n'a pas pu être créée")
	}
	return copyID.String, alreadyExisted, nil
}

// ForkToPersonal exerce le droit inaliénable de l'auteur (ou co-auteur accepté)
// de rapatrier une copie éditable dans son propre espace personnel, même s'il
// a été exclu du média.
func (s *Service) ForkToPersonal(ctx context.Context, articleID, userID string, snapshotID ...string) (string, bool, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return "", false, errNotFound
	}
	if row.PublisherType != db.PublisherTypeMEDIA && row.AuthorID == userID {
		return "", false, errors.New("Cet article est déjà votre article personnel.")
	}
	allowed := row.AuthorID == userID
	if !allowed && s.pool != nil {
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "ArticleAttribution" aa
				WHERE aa."articleId" = $1 AND aa."userId" = $2 AND aa."consentStatus" IN ('ACCEPTED', 'REVOKED')
			)
		`, articleID, toUUID(userID)).Scan(&allowed)
	}
	if !allowed {
		return "", false, errForbidden
	}

	var overrideTitle, overrideContent *string
	if len(snapshotID) > 0 && strings.TrimSpace(snapshotID[0]) != "" {
		snap, err := s.q.GetArticleSnapshotByID(ctx, snapshotID[0])
		if err == nil && snap.ArticleId == articleID {
			overrideTitle = &snap.Title
			overrideContent = &snap.Content
		}
	}

	return s.ensureAuthorSovereignCopy(ctx, articleID, userID, true, overrideTitle, overrideContent)
}

// ListSnapshots retourne la liste ordonnée des versions enregistrées de l'article.
func (s *Service) ListSnapshots(ctx context.Context, articleID, userID string) ([]ArticleSnapshotItem, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return nil, errNotFound
	}
	allowed := row.AuthorID == userID
	if !allowed {
		if mc, err := s.resolveMember(ctx, userID, row.PublisherId); err == nil && (mc.isMedia || mc.role == "owner") {
			allowed = true
		}
	}
	if !allowed && s.pool != nil {
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "ArticleAttribution"
				WHERE "articleId" = $1 AND "userId" = $2 AND "consentStatus" IN ('ACCEPTED', 'REVOKED')
			)
		`, articleID, toUUID(userID)).Scan(&allowed)
	}
	if !allowed {
		return nil, errForbidden
	}

	rows, err := s.q.ListArticleSnapshots(ctx, articleID)
	if err != nil {
		return nil, err
	}
	items := make([]ArticleSnapshotItem, 0, len(rows))
	for _, r := range rows {
		item := ArticleSnapshotItem{
			ID:        r.ID,
			ArticleID: r.ArticleId,
			Title:     r.Title,
			Content:   r.Content,
			WordCount: int(r.WordCount),
			Reason:    r.Reason,
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		}
		if r.ActorId.Valid {
			actID := uuidString(r.ActorId)
			item.ActorID = &actID
		}
		item.ActorName = textPtr(r.ActorName)
		item.ActorUsername = textPtr(r.ActorUsername)
		item.ActorAvatar = textPtr(r.ActorAvatar)
		items = append(items, item)
	}
	return items, nil
}

// RestoreSnapshot restaure le contenu d'un snapshot antérieur dans l'article.
func (s *Service) RestoreSnapshot(ctx context.Context, articleID, snapshotID, userID string) error {
	row, mc, err := s.authorizeEdit(ctx, articleID, userID, "")
	if err != nil {
		return err
	}
	_ = mc

	snap, err := s.q.GetArticleSnapshotByID(ctx, snapshotID)
	if err != nil || snap.ArticleId != articleID {
		return errors.New("version introuvable pour cet article")
	}

	// Sauvegarder la version actuelle avant restauration
	currentContent := row.Content
	if row.DraftContent.Valid && row.DraftContent.String != "" {
		currentContent = row.DraftContent.String
	}
	_ = s.captureSnapshot(ctx, articleID, &userID, row.Title, currentContent, "BEFORE_RESTORE")

	if row.Published {
		_, err = s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{String: snap.Content, Valid: true},
		})
	} else {
		_, _ = s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{Valid: false},
		})
		words := countWords(snap.Content)
		readingTime := words / 200
		if readingTime < 1 {
			readingTime = 1
		}
		_, err = s.q.UpdateArticleFull(ctx, db.UpdateArticleFullParams{
			ID:                     articleID,
			Title:                  snap.Title,
			Content:                snap.Content,
			Slug:                   row.Slug,
			Published:              row.Published,
			Status:                 row.Status,
			IsPremium:              row.IsPremium,
			CategoryId:             row.CategoryId,
			SeoTitle:               row.SeoTitle,
			SeoDescription:         row.SeoDescription,
			ReadingTime:            int32(readingTime),
			ScheduledAt:            row.ScheduledAt,
			ImageUrl:               imageVal(s.fetchArticleImageUrl(ctx, articleID)),
			CoverAlt:               row.CoverAlt,
			CoverDecorative:        row.CoverDecorative,
			AllowPublicAnnotations: row.AllowPublicAnnotations,
			AllowComments:          row.AllowComments,
			AllowDownload:          row.AllowDownload,
			ShowOnPersonalProfile:  row.ShowOnPersonalProfile,
		})
	}
	if err != nil {
		return err
	}

	s.recordEvent(ctx, EventInput{
		ArticleID:   articleID,
		PublisherID: row.PublisherId,
		ActorID:     userID,
		Type:        EventLiveUpdated,
		FromStatus:  row.Status,
		ToStatus:    row.Status,
	})
	return nil
}

// SubmitRevisionToOrigin soumet le contenu modifié d'un essai souverain personnel
// comme révision proposée à l'article média d'origine (soumise à validation du média).
func (s *Service) SubmitRevisionToOrigin(ctx context.Context, personalArticleID, userID string) (string, error) {
	personal, err := s.q.GetArticleByID(ctx, personalArticleID)
	if err != nil {
		return "", errNotFound
	}
	if personal.AuthorID != userID {
		return "", errForbidden
	}
	if !personal.OriginArticleId.Valid || personal.OriginArticleId.String == "" {
		return "", errors.New("Cet article n'est pas rattaché à un essai d'origine dans un média.")
	}
	originID := personal.OriginArticleId.String

	origin, err := s.q.GetArticleByID(ctx, originID)
	if err != nil {
		return "", errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, origin.PublisherId)
	if err != nil || !mc.isMedia || !permissions.CanEditMediaArticle(mc.member, origin.AuthorID, userID) {
		return "", errors.New("Vous n'êtes plus membre actif de ce média : vos modifications restent enregistrées dans votre espace personnel.")
	}

	contentToSubmit := personal.Content
	if personal.DraftContent.Valid && strings.TrimSpace(personal.DraftContent.String) != "" {
		contentToSubmit = personal.DraftContent.String
	}

	if _, err := s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
		ID:           originID,
		DraftContent: pgtype.Text{String: contentToSubmit, Valid: true},
	}); err != nil {
		return "", err
	}

	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID:        originID,
		Status:    "SUBMITTED",
		Published: origin.Published,
	}); err != nil {
		return "", err
	}

	_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
		ArticleId:   originID,
		PublisherId: origin.PublisherId,
		ReviewerId:  toUUID(userID),
		Action:      "SUBMITTED",
		Comment:     pgtype.Text{String: "Révision proposée depuis l'essai personnel de l'auteur.", Valid: true},
	})
	s.notifyReviewers(ctx, origin.PublisherId, originID, userID)
	s.recordEvent(ctx, EventInput{
		ArticleID: originID, PublisherID: origin.PublisherId, ActorID: userID,
		Type: EventSubmitted, FromStatus: statusOrDraft(origin.Status), ToStatus: "SUBMITTED",
	})
	return originID, nil
}
