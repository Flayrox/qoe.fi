// Package features mesure l'intérêt porté aux fonctionnalités indisponibles
// (à venir ou réservées à l'offre Pro) annoncées depuis l'interstitiel
// @qoe/ui. Un signal est attribué à un utilisateur ET à une publication :
// la publication personnelle du créateur, ou le média actif quand c'est un
// média. Les statistiques se lisent donc toujours par publication.
package features

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

var (
	// ErrForbidden : la publication visée n'appartient pas à l'appelant.
	ErrForbidden = errors.New("features: publication inaccessible")
	// ErrInvalidSignal : nature, source ou clé de fonctionnalité invalide.
	ErrInvalidSignal = errors.New("features: signal invalide")
)

// featureKeyPattern est le même contrat que la contrainte CHECK de la table :
// les clés viennent du catalogue @qoe/ui (kebab-case), jamais d'un libellé.
var featureKeyPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

const (
	KindView   = "view"
	KindNotify = "notify"

	SourceStudio = "studio"
	SourceSite   = "site"

	maxFeatureKeyLen = 64
	// Fenêtre de déduplication des vues : rouvrir l'annonce cent fois dans la
	// journée ne gonfle pas les statistiques.
	viewDedupWindow = "24 hours"
	// Fenêtre d'agrégation : l'intérêt se lit sur les 90 derniers jours.
	summaryWindow = "90 days"
)

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// SignalInput est le corps décodé par le handler, déjà borné.
type SignalInput struct {
	FeatureKey    string
	Kind          string
	Source        string
	PublicationID string
}

// SignalSummary est une ligne d'agrégat exposée au studio.
type SignalSummary struct {
	Feature  string `json:"feature"`
	Views    int    `json:"views"`
	Notifies int    `json:"notifies"`
}

// Record enregistre un signal d'intérêt et retourne l'état du « me prévenir »
// pour cette fonctionnalité (true si l'intention est désormais enregistrée,
// y compris si elle l'était déjà — l'index unique garantit l'idempotence).
func (s *Service) Record(ctx context.Context, userID string, in SignalInput) (bool, error) {
	if userID == "" {
		return false, ErrInvalidSignal
	}
	in.FeatureKey = strings.TrimSpace(in.FeatureKey)
	if len(in.FeatureKey) == 0 || len(in.FeatureKey) > maxFeatureKeyLen ||
		!featureKeyPattern.MatchString(in.FeatureKey) {
		return false, ErrInvalidSignal
	}
	if in.Kind != KindView && in.Kind != KindNotify {
		return false, ErrInvalidSignal
	}
	if in.Source == "" {
		in.Source = SourceStudio
	}
	if in.Source != SourceStudio && in.Source != SourceSite {
		return false, ErrInvalidSignal
	}

	publicationID, err := s.resolvePublication(ctx, userID, in.PublicationID)
	if err != nil {
		return false, err
	}

	pub := pgtype.Text{}
	if publicationID != "" {
		pub = pgtype.Text{String: publicationID, Valid: true}
	}

	if in.Kind == KindNotify {
		tag, err := s.pool.Exec(ctx, `
			INSERT INTO "FeatureSignal" ("featureKey", "kind", "source", "userId", "publicationId")
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT DO NOTHING
		`, in.FeatureKey, in.Kind, in.Source, userID, pub)
		if err != nil {
			return false, err
		}
		// 0 ligne = intention déjà enregistrée : le client doit voir « c'est
		// noté », donc on répond true dans les deux cas (idempotent).
		_ = tag
		return true, nil
	}

	// Vue : au plus une par utilisateur et par fonctionnalité sur 24 h.
	_, err = s.pool.Exec(ctx, `
		INSERT INTO "FeatureSignal" ("featureKey", "kind", "source", "userId", "publicationId")
		SELECT $1, $2, $3, $4, $5
		WHERE NOT EXISTS (
			SELECT 1 FROM "FeatureSignal"
			 WHERE "userId" = $4 AND "featureKey" = $1 AND "kind" = $2
			   AND "createdAt" >= now() - $6::interval
		)
	`, in.FeatureKey, in.Kind, in.Source, userID, pub, viewDedupWindow)
	if err != nil {
		return false, err
	}
	return false, nil
}

// Summary agrège les signaux d'une publication sur 90 jours.
func (s *Service) Summary(ctx context.Context, userID, publicationID string) ([]SignalSummary, error) {
	if publicationID == "" {
		return nil, ErrInvalidSignal
	}
	allowed, err := s.canAccess(ctx, userID, publicationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrForbidden
	}

	rows, err := s.pool.Query(ctx, `
		SELECT "featureKey",
		       COUNT(*) FILTER (WHERE "kind" = 'view')::int   AS views,
		       COUNT(*) FILTER (WHERE "kind" = 'notify')::int AS notifies
		  FROM "FeatureSignal"
		 WHERE "publicationId" = $1
		   AND "createdAt" >= now() - $2::interval
		 GROUP BY "featureKey"
		 ORDER BY notifies DESC, views DESC, "featureKey" ASC
	`, publicationID, summaryWindow)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]SignalSummary, 0, 4)
	for rows.Next() {
		var row SignalSummary
		if err := rows.Scan(&row.Feature, &row.Views, &row.Notifies); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// resolvePublication attribue le signal : publication demandée (après contrôle
// d'accès), sinon la publication personnelle du créateur.
func (s *Service) resolvePublication(ctx context.Context, userID, requested string) (string, error) {
	if requested != "" {
		allowed, err := s.canAccess(ctx, userID, requested)
		if err != nil {
			return "", err
		}
		if !allowed {
			return "", ErrForbidden
		}
		return requested, nil
	}
	personal, err := s.q.GetUserPersonalPublication(ctx, userID)
	if err != nil || !personal.Valid {
		// Pas de publication personnelle (compte sans espace) : le signal
		// reste utile pour l'utilisateur, simplement non rattaché.
		return "", nil
	}
	return personal.String, nil
}

// canAccess reprend la règle des analytics : publication personnelle, ou
// rôle owner/editor sur le média.
func (s *Service) canAccess(ctx context.Context, userID, publicationID string) (bool, error) {
	if userID == "" {
		return false, nil
	}
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil &&
		personal.Valid && personal.String == publicationID {
		return true, nil
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		// Aucun rôle = pas d'accès ; une vraie panne DB remontera sur les
		// écritures suivantes, inutile de la confondre avec un refus ici.
		return false, nil
	}
	return role == "owner" || role == "editor", nil
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}
