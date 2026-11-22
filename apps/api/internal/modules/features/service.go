// Package features mesure l'intérêt porté aux fonctionnalités indisponibles
// (à venir ou réservées à l'offre Pro) annoncées depuis l'interstitiel
// @qoe/ui. Un signal est attribué à un utilisateur ET à une publication :
// la publication personnelle du créateur, ou le média actif quand c'est un
// média. Les statistiques se lisent donc toujours par publication.
package features

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/publicurl"
)

var (
	// ErrForbidden : la publication visée n'appartient pas à l'appelant.
	ErrForbidden = errors.New("features: publication inaccessible")
	// ErrInvalidSignal : nature, source ou clé de fonctionnalité invalide.
	ErrInvalidSignal = errors.New("features: signal invalide")
	// ErrFeatureUnavailable : la fonctionnalité n'accepte pas de promesse
	// (inconnue, en pause, retirée ou notifyEnabled=false).
	ErrFeatureUnavailable = errors.New("features: notifications fermées pour cette fonctionnalité")
	// ErrUnsubscribeInvalid : jeton absent, mal formé ou signature invalide.
	ErrUnsubscribeInvalid = errors.New("features: désabonnement invalide")
	// errStoreUnavailable : le service a été monté sans base. Panne de
	// configuration, jamais un refus métier : elle doit remonter en 500.
	errStoreUnavailable = errors.New("features: base de données indisponible")
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
	// maxPublisherIDLen borne l'identifiant de publication accepté du client :
	// au-delà, c'est une entrée forgée, pas une publication.
	maxPublisherIDLen = 64
	// Fenêtre de déduplication des vues : rouvrir l'annonce cent fois dans la
	// journée ne gonfle pas les statistiques.
	viewDedupWindow = "24 hours"
	// Fenêtre d'agrégation : l'intérêt se lit sur les 90 derniers jours.
	summaryWindow = "90 days"
	// maxSummaryRows borne la réponse du résumé : les clés de fonctionnalité
	// sont libres côté client, un compte peut en créer autant qu'il veut, et
	// la réponse ne doit pas devenir un export.
	maxSummaryRows = 50
)

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries

	// unsubscribeSecret signe les jetons de retrait. Vide = retrait public
	// indisponible (refus explicite, jamais de jeton non signé).
	unsubscribeSecret string
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// SetUnsubscribeSecret branche la clé HMAC des liens de désabonnement.
func (s *Service) SetUnsubscribeSecret(secret string) {
	s.unsubscribeSecret = strings.TrimSpace(secret)
}

// FeatureState est l'état opérationnel utile au client : le CTA ne doit pas
// promettre une notification que le serveur refusera.
type FeatureState struct {
	Key           string `json:"key"`
	Status        string `json:"status"`
	NotifyEnabled bool   `json:"notifyEnabled"`
	Notified      bool   `json:"notified"`
}

// SignalInput est le corps décodé par le handler, déjà borné.
type SignalInput struct {
	FeatureKey  string
	Kind        string
	Source      string
	PublisherID string
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
	in.PublisherID = strings.TrimSpace(in.PublisherID)
	if len(in.PublisherID) > maxPublisherIDLen {
		return false, ErrInvalidSignal
	}
	if in.Source == "" {
		in.Source = SourceStudio
	}
	if in.Source != SourceStudio && in.Source != SourceSite {
		return false, ErrInvalidSignal
	}
	// Un service sans base est une panne de configuration : refuser en 500
	// plutôt que de paniquer sur un pool nul (le chemin « vue » n'avait aucun
	// garde). Le catalogue, lui, n'est consultable qu'avec une base.
	if s.pool == nil || s.q == nil {
		if in.Kind == KindNotify {
			return false, ErrFeatureUnavailable
		}
		return false, errStoreUnavailable
	}

	publisherID, err := s.resolvePublisher(ctx, userID, in.PublisherID)
	if err != nil {
		return false, err
	}

	pub := pgtype.Text{}
	if publisherID != "" {
		pub = pgtype.Text{String: publisherID, Valid: true}
	}

	if in.Kind == KindNotify {
		if err := s.requireNotifyOpen(ctx, in.FeatureKey); err != nil {
			return false, err
		}
		// La promesse durable vit dans FeatureInterest. Le signal reste écrit
		// pour le funnel, mais il n'est plus la source de vérité du bouton.
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "FeatureInterest"
			    ("featureKey", "userId", "publisherId", "source", "status", "consentVersion", "consentAt", "updatedAt")
			VALUES ($1, $2::uuid, $3, $4, 'active', 'v1', now(), now())
			ON CONFLICT ("userId", "featureKey") DO UPDATE SET
			    "status" = 'active',
			    "unsubscribedAt" = NULL,
			    "publisherId" = EXCLUDED."publisherId",
			    "source" = EXCLUDED."source",
			    "consentVersion" = EXCLUDED."consentVersion",
			    "consentAt" = now(),
			    "updatedAt" = now()
		`, in.FeatureKey, userID, pub, in.Source); err != nil {
			return false, err
		}
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "FeatureSignal" ("featureKey", "kind", "source", "userId", "publisherId")
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT DO NOTHING
		`, in.FeatureKey, in.Kind, in.Source, userID, pub); err != nil {
			return false, err
		}
		return true, nil
	}

	// Vue : au plus une par utilisateur et par fonctionnalité sur 24 h. La
	// rétention des signaux est tenue par le worker (workers.FeatureSignalRetention),
	// plus jamais par la requête : un DELETE global n'a rien à faire ici.
	_, err = s.pool.Exec(ctx, `
		INSERT INTO "FeatureSignal" ("featureKey", "kind", "source", "userId", "publisherId")
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

// NotifiedFeatures liste les fonctionnalités pour lesquelles l'utilisateur a
// demandé à être prévenu — la promesse est globale au compte, pas par
// publication (cf. index unique userId + featureKey).
func (s *Service) NotifiedFeatures(ctx context.Context, userID string) ([]string, error) {
	if userID == "" {
		return nil, ErrInvalidSignal
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "featureKey"
		  FROM "FeatureInterest"
		 WHERE "userId" = $1::uuid AND "status" = 'active'
		 ORDER BY "featureKey"`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]string, 0, 4)
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		out = append(out, key)
	}
	return out, rows.Err()
}

// States retourne le catalogue opérationnel et l'état de la promesse pour
// l'appelant. Un client ne doit jamais afficher « Me prévenir » quand
// notifyEnabled=false ou quand le statut est paused/retired.
func (s *Service) States(ctx context.Context, userID string) ([]FeatureState, error) {
	if userID == "" {
		return nil, ErrInvalidSignal
	}
	rows, err := s.pool.Query(ctx, `
		SELECT f."key", f."status", f."notifyEnabled", COALESCE(i."status" = 'active', false)
		  FROM "Feature" f
		  LEFT JOIN "FeatureInterest" i
		    ON i."featureKey" = f."key" AND i."userId" = $1::uuid
		 ORDER BY f."key"`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]FeatureState, 0, 8)
	for rows.Next() {
		var st FeatureState
		if err := rows.Scan(&st.Key, &st.Status, &st.NotifyEnabled, &st.Notified); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// requireNotifyOpen vérifie l'état serveur avant d'enregistrer une promesse.
func (s *Service) requireNotifyOpen(ctx context.Context, featureKey string) error {
	var status string
	var enabled bool
	err := s.pool.QueryRow(ctx, `
		SELECT "status", "notifyEnabled" FROM "Feature" WHERE "key" = $1`, featureKey).Scan(&status, &enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrFeatureUnavailable
	}
	if err != nil {
		return err
	}
	if !enabled || status == "paused" || status == "retired" {
		return ErrFeatureUnavailable
	}
	return nil
}

// UnsubscribeToken signe l'identifiant d'un intérêt pour un lien de retrait
// sans exposer l'email. Le jeton est l'ID encodé + une signature HMAC. Exporté
// pour que les campagnes admin scellent le MÊME jeton : deux implémentations
// du même contrat finissent toujours par diverger et casser les liens.
func UnsubscribeToken(secret, interestID string) (string, error) {
	if strings.TrimSpace(secret) == "" || strings.TrimSpace(interestID) == "" {
		return "", ErrUnsubscribeInvalid
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(interestID))
	return base64.RawURLEncoding.EncodeToString([]byte(interestID)) + "." + hex.EncodeToString(mac.Sum(nil)), nil
}

// UnsubscribeLink construit le lien public de retrait (page de confirmation,
// POST RFC 8058) pour un intérêt donné, sur la racine publique configurée.
func UnsubscribeLink(secret, interestID string) (string, error) {
	token, err := UnsubscribeToken(secret, interestID)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s/v1/features/unsubscribe?token=%s", publicurl.Base(), url.QueryEscape(token)), nil
}

// SignInterestToken signe l'identifiant d'un intérêt avec le secret du service.
func (s *Service) SignInterestToken(interestID string) (string, error) {
	return UnsubscribeToken(s.unsubscribeSecret, interestID)
}

// UnsubscribeURL construit le lien de retrait pour un intérêt donné.
func (s *Service) UnsubscribeURL(interestID string) (string, error) {
	return UnsubscribeLink(s.unsubscribeSecret, interestID)
}

// Unsubscribe vérifie le jeton puis retire la promesse. Retourne la clé de
// fonctionnalité pour que la page publique puisse confirmer sans fuite.
func (s *Service) Unsubscribe(ctx context.Context, token string) (string, error) {
	if s.unsubscribeSecret == "" || token == "" {
		return "", ErrUnsubscribeInvalid
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", ErrUnsubscribeInvalid
	}
	rawID, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || len(rawID) == 0 || len(rawID) > 128 {
		return "", ErrUnsubscribeInvalid
	}
	interestID := string(rawID)
	mac := hmac.New(sha256.New, []byte(s.unsubscribeSecret))
	mac.Write([]byte(interestID))
	expected := hex.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) != 1 {
		return "", ErrUnsubscribeInvalid
	}
	var featureKey string
	err = s.pool.QueryRow(ctx, `
		UPDATE "FeatureInterest"
		SET "status" = 'unsubscribed', "unsubscribedAt" = now(), "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'active'
		RETURNING "featureKey"`, interestID).Scan(&featureKey)
	if errors.Is(err, pgx.ErrNoRows) {
		// Déjà retiré : idempotent, on retrouve la clé pour la confirmation.
		if qerr := s.pool.QueryRow(ctx, `SELECT "featureKey" FROM "FeatureInterest" WHERE "id" = $1`, interestID).Scan(&featureKey); qerr != nil {
			return "", ErrUnsubscribeInvalid
		}
		return featureKey, nil
	}
	if err != nil {
		return "", err
	}
	return featureKey, nil
}

// UnsubscribeForUser retire la promesse depuis le compte connecté, sans jeton
// public : utile pour les préférences.
func (s *Service) UnsubscribeForUser(ctx context.Context, userID, featureKey string) error {
	if userID == "" || featureKey == "" {
		return ErrInvalidSignal
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE "FeatureInterest"
		SET "status" = 'unsubscribed', "unsubscribedAt" = now(), "updatedAt" = now()
		WHERE "userId" = $1::uuid AND "featureKey" = $2 AND "status" = 'active'`, userID, featureKey)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFeatureUnavailable
	}
	return nil
}

// Summary agrège les signaux d'une publication sur 90 jours.
func (s *Service) Summary(ctx context.Context, userID, publisherID string) ([]SignalSummary, error) {
	publisherID = strings.TrimSpace(publisherID)
	if publisherID == "" || len(publisherID) > maxPublisherIDLen {
		return nil, ErrInvalidSignal
	}
	allowed, err := s.canAccess(ctx, userID, publisherID)
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
		 WHERE "publisherId" = $1
		   AND "createdAt" >= now() - $2::interval
		 GROUP BY "featureKey"
		 ORDER BY notifies DESC, views DESC, "featureKey" ASC
		 LIMIT $3
	`, publisherID, summaryWindow, maxSummaryRows)
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

// resolvePublisher attribue le signal : publication demandée (après contrôle
// d'accès), sinon la publication personnelle du créateur.
func (s *Service) resolvePublisher(ctx context.Context, userID, requested string) (string, error) {
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
	personal, err := s.q.GetUserPersonalPublisher(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		// Compte sans ligne User (pas encore synchronisé) : le signal reste
		// utile, simplement non rattaché.
		return "", nil
	}
	if err != nil {
		// Une panne DB rendait le signal anonyme en silence : les analytics
		// perdaient l'attribution sans la moindre trace.
		return "", err
	}
	if !personal.Valid {
		return "", nil
	}
	return personal.String, nil
}

// canAccess reprend la règle des analytics : publication personnelle, ou
// rôle owner/editor sur le média.
func (s *Service) canAccess(ctx context.Context, userID, publisherID string) (bool, error) {
	if userID == "" {
		return false, nil
	}
	personal, err := s.q.GetUserPersonalPublisher(ctx, userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		// Avant, toute panne devenait « 403 publication inaccessible » :
		// l'incident disparaissait derrière un refus métier.
		return false, err
	}
	if err == nil && personal.Valid && personal.String == publisherID {
		return true, nil
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublisherId: publisherID, UserId: toUUID(userID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return role == "owner" || role == "editor", nil
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}
