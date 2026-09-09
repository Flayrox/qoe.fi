// Package imports — import d'articles en lot (RSS / Substack / Ghost).
// Migration de apps/studio/src/app/(creator)/import/actions.ts : le parsing et
// l'assainissement HTML restent côté serveur action (logique pure, zéro DB) ;
// la création dédupliquée des articles passe ici, en Go.
package imports

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

var (
	errForbidden = errors.New("accès refusé")
	errNotFound  = errors.New("introuvable")
)

// maxImportArticles borne un job (10 000 articles — mémoire + JSONB bornés).
const maxImportArticles = 10000

// maxImportErrors borne le rapport d'erreurs persisté (JSONB borné).
const maxImportErrors = 500

type Service struct {
	pool  *pgxpool.Pool
	q     *db.Queries
	asynq *asynq.Client
}

func NewService(pool *pgxpool.Pool, asynqClient *asynq.Client) *Service {
	return &Service{pool: pool, q: db.New(pool), asynq: asynqClient}
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

// ImportArticle est un article prêt à créer (déjà nettoyé côté client).
type ImportArticle struct {
	Title       string `json:"title"`
	Slug        string `json:"slug"`
	Content     string `json:"content"`
	ReadingTime int32  `json:"readingTime"`
}

type ImportArticlesRequest struct {
	PublicationID string          `json:"publicationId"`
	Articles      []ImportArticle `json:"articles"`
}

// canImport vérifie que l'utilisateur peut créer des articles dans la
// publication : propriétaire de sa publication personnelle OU owner/editor d'un
// média (parité analytics.canAccess).
func (s *Service) canImport(ctx context.Context, userID, publicationID string) bool {
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return true
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return false
	}
	return role == "owner" || role == "editor"
}

// ImportArticles crée les articles manquants (dédup par publicationId + slug,
// parité prisma.article.findUnique + create du fallback TS). Renvoie le nombre
// d'articles réellement créés (mode synchrone historique).
func (s *Service) ImportArticles(ctx context.Context, userID string, req ImportArticlesRequest) (int, error) {
	if !s.canImport(ctx, userID, req.PublicationID) {
		return 0, errForbidden
	}
	return s.importBatch(ctx, req.PublicationID, toUUID(userID), req.Articles).imported, nil
}

// ImportError est une erreur par article du rapport d'un job.
type ImportError struct {
	Slug   string `json:"slug"`
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

// importOutcome détaille le résultat d'un lot (importés / doublons / erreurs).
type importOutcome struct {
	imported   int
	duplicates int
	errors     []ImportError
}

// importBatch applique un lot : dédup par publication+slug, best-effort par
// article (un échec n'interrompt pas le lot) et rapport d'erreurs par article.
func (s *Service) importBatch(ctx context.Context, publicationID string, authorID pgtype.UUID, articles []ImportArticle) importOutcome {
	var out importOutcome
	for _, art := range articles {
		if art.Title == "" || art.Slug == "" {
			out.errors = append(out.errors, ImportError{Slug: art.Slug, Title: art.Title, Reason: "Titre ou slug manquant"})
			continue
		}
		if _, err := s.q.GetArticleIdByPublicationAndSlug(ctx, db.GetArticleIdByPublicationAndSlugParams{
			PublicationId: publicationID, Slug: art.Slug,
		}); err == nil {
			// Déjà importé — on compte (dédup).
			out.duplicates++
			continue
		} else if !errors.Is(err, pgx.ErrNoRows) {
			out.errors = append(out.errors, ImportError{Slug: art.Slug, Title: art.Title, Reason: "Vérification du slug impossible"})
			log.Printf("[imports] check slug %q: %v", art.Slug, err)
			continue
		}

		// Parité avec le create Prisma du fallback TS : published, PUBLIC,
		// statut par défaut (DRAFT), author = user, lecture estimée.
		if _, err := s.q.CreateArticle(ctx, db.CreateArticleParams{
			Title:                  art.Title,
			Slug:                   art.Slug,
			Content:                art.Content,
			Published:              true,
			IsPremium:              false,
			Visibility:             "PUBLIC",
			ReadingTime:            art.ReadingTime,
			AllowPublicAnnotations: true,
			AllowComments:          true,
			Status:                 "DRAFT",
			PublicationId:          publicationID,
			AuthorId:               authorID,
		}); err != nil {
			out.errors = append(out.errors, ImportError{Slug: art.Slug, Title: art.Title, Reason: "Création de l'article échouée"})
			log.Printf("[imports] create %q: %v", art.Slug, err)
			continue
		}
		out.imported++
	}
	return out
}

// CreateImportJob enregistre un job d'import ASYNCHRONE et l'enqueue asynq
// (queue low — les lots peuvent contenir des milliers d'articles). Le worker
// met à jour la progression et le rapport d'erreurs ; l'API expose le statut
// via GET /v1/import/jobs/{id}.
func (s *Service) CreateImportJob(ctx context.Context, userID string, req ImportArticlesRequest) (string, error) {
	if !s.canImport(ctx, userID, req.PublicationID) {
		return "", errForbidden
	}
	if len(req.Articles) > maxImportArticles {
		return "", fmt.Errorf("lot trop volumineux : %d articles max %d", len(req.Articles), maxImportArticles)
	}
	raw, err := json.Marshal(req.Articles)
	if err != nil {
		return "", err
	}
	id, err := s.q.InsertArticleImportJob(ctx, db.InsertArticleImportJobParams{
		UserId:        toUUID(userID),
		PublicationId: req.PublicationID,
		Total:         int32(len(req.Articles)),
		Articles:      raw,
	})
	if err != nil {
		return "", err
	}
	if err := queue.PublishBulkImport(s.asynq, queue.BulkImportPayload{JobID: id}); err != nil {
		// Le job reste PENDING (rejouable) : on ne bloque pas la réponse 202.
		log.Printf("[imports] enqueue job %s: %v", id, err)
	}
	return id, nil
}

// ProcessImportJob exécute un job (appelé par le worker asynq). Idempotent :
// un job absent (supprimé) est un no-op ; une reprise après crash relit le job.
func (s *Service) ProcessImportJob(ctx context.Context, jobID string) error {
	job, err := s.q.GetArticleImportJobByID(ctx, jobID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // job supprimé avant traitement → rien à faire.
		}
		return err
	}
	if err := s.q.MarkArticleImportJobRunning(ctx, jobID); err != nil {
		return err
	}
	var articles []ImportArticle
	if err := json.Unmarshal(job.Articles, &articles); err != nil {
		_ = s.q.FailArticleImportJob(ctx, jobID)
		return fmt.Errorf("articles du job %s: %w", jobID, err)
	}
	out := s.importBatch(ctx, job.PublicationId, toUUID(job.UserId), articles)
	if len(out.errors) > maxImportErrors {
		out.errors = out.errors[:maxImportErrors]
	}
	raw, err := json.Marshal(out.errors)
	if err != nil {
		return err
	}
	return s.q.FinishArticleImportJob(ctx, db.FinishArticleImportJobParams{
		ID:         jobID,
		Imported:   int32(out.imported),
		Duplicates: int32(out.duplicates),
		Errors:     raw,
	})
}

// ImportJobDTO est la vue API d'un job d'import (statut + progression + rapport).
type ImportJobDTO struct {
	ID            string        `json:"id"`
	PublicationID string        `json:"publicationId"`
	Status        string        `json:"status"`
	Total         int           `json:"total"`
	Imported      int           `json:"imported"`
	Duplicates    int           `json:"duplicates"`
	Errors        []ImportError `json:"errors"`
	CreatedAt     string        `json:"createdAt"`
	UpdatedAt     string        `json:"updatedAt"`
}

// importJobRow est la vue minimale commune des lignes ArticleImportJob
// (GetArticleImportJobRow et ListArticleImportJobsRow sont des types sqlc
// distincts mais aux mêmes champs).
type importJobRow struct {
	ID            string
	PublicationID string
	Status        string
	Total         int32
	Imported      int32
	Duplicates    int32
	Errors        []byte
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func toImportJobDTO(row importJobRow) (ImportJobDTO, error) {
	var errs []ImportError
	if len(row.Errors) > 0 {
		if err := json.Unmarshal(row.Errors, &errs); err != nil {
			return ImportJobDTO{}, err
		}
	}
	if errs == nil {
		errs = []ImportError{}
	}
	return ImportJobDTO{
		ID: row.ID, PublicationID: row.PublicationID, Status: row.Status,
		Total: int(row.Total), Imported: int(row.Imported), Duplicates: int(row.Duplicates),
		Errors:    errs,
		CreatedAt: row.CreatedAt.Format(time.RFC3339),
		UpdatedAt: row.UpdatedAt.Format(time.RFC3339),
	}, nil
}

func importJobRowFromGet(row db.GetArticleImportJobRow) importJobRow {
	return importJobRow{
		ID: row.ID, PublicationID: row.PublicationId, Status: row.Status,
		Total: row.Total, Imported: row.Imported, Duplicates: row.Duplicates,
		Errors:    row.Errors,
		CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
	}
}

func importJobRowFromList(row db.ListArticleImportJobsRow) importJobRow {
	return importJobRow{
		ID: row.ID, PublicationID: row.PublicationId, Status: row.Status,
		Total: row.Total, Imported: row.Imported, Duplicates: row.Duplicates,
		Errors:    row.Errors,
		CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
	}
}

// GetImportJob retourne un job (propriétaire uniquement).
func (s *Service) GetImportJob(ctx context.Context, userID, id string) (ImportJobDTO, error) {
	row, err := s.q.GetArticleImportJob(ctx, db.GetArticleImportJobParams{ID: id, UserId: toUUID(userID)})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ImportJobDTO{}, errNotFound
		}
		return ImportJobDTO{}, err
	}
	return toImportJobDTO(importJobRowFromGet(row))
}

// ListImportJobs liste les jobs récents de l'utilisateur (20 max).
func (s *Service) ListImportJobs(ctx context.Context, userID string) ([]ImportJobDTO, error) {
	rows, err := s.q.ListArticleImportJobs(ctx, db.ListArticleImportJobsParams{
		UserId: toUUID(userID), Limit: 20,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ImportJobDTO, 0, len(rows))
	for _, row := range rows {
		dto, err := toImportJobDTO(importJobRowFromList(row))
		if err != nil {
			continue // rapport illisible → on saute (best-effort)
		}
		out = append(out, dto)
	}
	return out, nil
}
