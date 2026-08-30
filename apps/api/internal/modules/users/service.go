package users

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/shared/identifier"
)

type Service struct {
	pool   pooler
	gotrue *goTrueClient
}

type Identity struct {
	Email string `json:"email"`
}

func (s *Service) Identity(ctx context.Context, userID string) (Identity, error) {
	var out Identity
	err := s.pool.QueryRow(ctx, `SELECT email FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&out.Email)
	if err != nil {
		return out, err
	}
	return out, nil
}

func (s *Service) MFA(ctx context.Context, userID, authorization string) (map[string]any, error) {
	return s.gotrueRequest(ctx, userID, authorization, http.MethodGet, "/auth/v1/factors", nil)
}
func (s *Service) MFARequest(ctx context.Context, userID, authorization, method, path string, payload map[string]any) (map[string]any, error) {
	return s.gotrueRequest(ctx, userID, authorization, method, path, payload)
}
func (s *Service) MFADelete(ctx context.Context, userID, authorization, path string) error {
	_, err := s.gotrueRequest(ctx, userID, authorization, http.MethodDelete, path, nil)
	return err
}
func (s *Service) gotrueRequest(ctx context.Context, userID, authorization, method, path string, payload map[string]any) (map[string]any, error) {
	if s.gotrue == nil {
		s.gotrue = newGoTrueClient(os.Getenv("SUPABASE_AUTH_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	}
	return s.gotrue.requestWithAuthorization(ctx, userID, authorization, method, path, payload)
}

func (s *Service) reauthenticate(ctx context.Context, userID, currentPassword string) error {
	var email string
	if err := s.pool.QueryRow(ctx, `SELECT email FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&email); err != nil {
		return err
	}
	if strings.TrimSpace(currentPassword) == "" {
		return errors.New("Le mot de passe actuel est requis.")
	}
	if s.gotrue == nil {
		s.gotrue = newGoTrueClient(os.Getenv("SUPABASE_AUTH_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	}
	return s.gotrue.verifyPassword(ctx, email, currentPassword)
}

func (s *Service) ChangeEmail(ctx context.Context, userID, currentPassword, newEmail string) error {
	if s.gotrue == nil {
		s.gotrue = newGoTrueClient(os.Getenv("SUPABASE_AUTH_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	}
	if err := s.reauthenticate(ctx, userID, currentPassword); err != nil {
		return errors.New("Réauthentification échouée.")
	}
	newEmail = strings.ToLower(strings.TrimSpace(newEmail))
	if !strings.Contains(newEmail, "@") || len(newEmail) > 320 {
		return errors.New("Adresse email invalide.")
	}
	if err := s.gotrue.updateUser(ctx, userID, map[string]any{"email": newEmail, "email_confirm": false}); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `UPDATE "User" SET email = $1, "updatedAt" = now() WHERE id = $2`, newEmail, toUUID(userID))
	return err
}

func (s *Service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	if s.gotrue == nil {
		s.gotrue = newGoTrueClient(os.Getenv("SUPABASE_AUTH_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	}
	if err := s.reauthenticate(ctx, userID, currentPassword); err != nil {
		return errors.New("Réauthentification échouée.")
	}
	if len(newPassword) < 12 || len(newPassword) > 128 {
		return errors.New("Le nouveau mot de passe doit contenir entre 12 et 128 caractères.")
	}
	return s.gotrue.updateUser(ctx, userID, map[string]any{"password": newPassword})
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, gotrue: newGoTrueClient(os.Getenv("SUPABASE_AUTH_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))}
}

type Contributor struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
	Slug        *string `json:"slug"`
	Subdomain   *string `json:"subdomain"`
	HeroText    *string `json:"heroText"`
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

// SearchForContributors cherche des utilisateurs pour co-auteur (name/username/email contains, insensible).
// Mirroir de packages/api-client/src/actions/articles/index.ts searchArticleContributorsAction.
func (s *Service) SearchForContributors(ctx context.Context, query string, excludeIds []string) ([]Contributor, error) {
	if len(query) < 2 {
		return []Contributor{}, nil
	}
	q := "%" + query + "%"
	// Construit le tableau d'UUIDs à exclure
	excludeUUIDs := make([]pgtype.UUID, 0, len(excludeIds))
	for _, id := range excludeIds {
		if id != "" {
			excludeUUIDs = append(excludeUUIDs, toUUID(id))
		}
	}
	// Si aucun à exclure, on passe un tableau vide
	rows, err := s.pool.Query(ctx, `
		SELECT u.id::text, u.name, u.username, u."logoUrl", u."isCertified",
		       p.slug, p."subdomain", p."heroText"
		FROM "User" u
		LEFT JOIN "Publication" p ON p.id = u."publicationId"
		WHERE u."isSuspended" = false AND u."isShadowbanned" = false
		  AND u.id != ALL($2::uuid[])
		  AND (u.name ILIKE $1 OR u.username ILIKE $1 OR u.email ILIKE $1)
		ORDER BY u.name ASC
		LIMIT 8
	`, q, excludeUUIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Contributor
	for rows.Next() {
		var c Contributor
		var name, username, logo pgtype.Text
		var certified bool
		var pubSlug, pubSubdomain, pubHeroText pgtype.Text
		if err := rows.Scan(&c.ID, &name, &username, &logo, &certified, &pubSlug, &pubSubdomain, &pubHeroText); err != nil {
			continue
		}
		c.Name = textPtr(name)
		c.Username = textPtr(username)
		c.LogoURL = textPtr(logo)
		c.IsCertified = certified
		c.Slug = textPtr(pubSlug)
		c.Subdomain = textPtr(pubSubdomain)
		c.HeroText = textPtr(pubHeroText)
		out = append(out, c)
	}
	if out == nil {
		out = []Contributor{}
	}
	return out, rows.Err()
}

// MediaPublicationForUser renvoie l'id de publication d'un média pour lequel
// l'utilisateur est membre actif (résolution du workspace MEDIA du dashboard).
// Retourne ("", nil) si non membre — parité prisma.mediaMember.findUnique.
func (s *Service) MediaPublicationForUser(ctx context.Context, userID, mediaID string) (string, error) {
	var pubID pgtype.Text
	err := s.pool.QueryRow(ctx, `
		SELECT p.id::text
		FROM "MediaMember" mm
		JOIN "Media" m ON m.id = mm."mediaId"
		JOIN "Publication" p ON p.id = m."publicationId"
		WHERE mm."userId" = $1 AND mm."mediaId" = $2 AND mm.status = 'active'`,
		toUUID(userID), mediaID).Scan(&pubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if !pubID.Valid {
		return "", nil
	}
	return pubID.String, nil
}

// ── Profil lecteur (GET /v1/me, PATCH /v1/me/profile) ─────────────────────

// ReaderProfile est le profil lecteur renvoyé par GET /v1/me : identité +
// compteurs de la bibliothèque (suivis, mots masqués) — porté de
// getRequestDbUser / getAccountSettingsAction / login (Prisma).
type ReaderProfile struct {
	ID                     string  `json:"id"`
	Email                  string  `json:"email"`
	Name                   *string `json:"name"`
	Username               *string `json:"username"`
	LogoURL                *string `json:"logoUrl"`
	OnboardingText         *string `json:"onboardingText"`
	Pronouns               *string `json:"pronouns"`
	Role                   string  `json:"role"`
	WalletBalanceCents     int32   `json:"walletBalanceCents"`
	HasCompletedOnboarding bool    `json:"hasCompletedOnboarding"`
	IsCertified            bool    `json:"isCertified"`
	AdvancedSettingsMode   bool    `json:"advancedSettingsMode"`
	CreatedAt              string  `json:"createdAt"`
	FollowsCount           int32   `json:"followsCount"`
	MutedWordsCount        int32   `json:"mutedWordsCount"`
	IsMediaMember          bool    `json:"isMediaMember"`
}

// Usernames are stable public identifiers: ASCII lowercase letters, digits,
// underscores and dots only. Keeping the rule here (rather than in the UI)
// makes every client and import path obey the same contract.
// A separator must be surrounded by identifier characters: dots and
// underscores are allowed, but never consecutively ("a..b", "a__b", etc.).
var usernamePattern = identifier.UsernamePattern

// Profile retourne le profil lecteur complet (id = sub du JWT Supabase).
func (s *Service) Profile(ctx context.Context, userID string) (*ReaderProfile, error) {
	var p ReaderProfile
	var createdAt pgtype.Timestamp
	err := s.pool.QueryRow(ctx, `
		SELECT u.id::text, u.email, u.name, u.username, u."logoUrl", u."onboardingText", u.pronouns,
		       u.role, u."walletBalanceCents", u."hasCompletedOnboarding", u."isCertified",
		       u."advancedSettingsMode", u."createdAt",
		       (SELECT COUNT(*)::int FROM "Follows" f WHERE f."readerId" = u.id)  AS follows_count,
		       (SELECT COUNT(*)::int FROM "MutedWord" m WHERE m."userId" = u.id)  AS muted_count,
		       EXISTS(SELECT 1 FROM "MediaMember" mm
		              WHERE mm."userId" = u.id AND mm.status = 'active') AS is_media_member
		FROM "User" u
		WHERE u.id = $1`, toUUID(userID)).
		Scan(&p.ID, &p.Email, &p.Name, &p.Username, &p.LogoURL, &p.OnboardingText, &p.Pronouns,
			&p.Role, &p.WalletBalanceCents, &p.HasCompletedOnboarding, &p.IsCertified,
			&p.AdvancedSettingsMode, &createdAt,
			&p.FollowsCount, &p.MutedWordsCount, &p.IsMediaMember)
	if err != nil {
		return nil, err
	}
	p.CreatedAt = createdAt.Time.Format(time.RFC3339)
	return &p, nil
}

// UpdateProfile met à jour le profil lecteur (name, username, onboardingText,
// logoUrl, pronouns) — validation identique à updateAccountProfileAction.
func (s *Service) UpdateProfile(ctx context.Context, userID, name, username, onboardingText, logoURL, pronouns string) (*ReaderProfile, error) {
	name = strings.TrimSpace(name)
	if len(name) > 120 {
		name = name[:120]
	}
	username = identifier.NormalizeUsername(username)
	onboardingText = strings.TrimSpace(onboardingText)
	if len(onboardingText) > 500 {
		onboardingText = onboardingText[:500]
	}
	logoURL = strings.TrimSpace(logoURL)
	if len(logoURL) > 2000 {
		logoURL = logoURL[:2000]
	}
	pronouns = strings.TrimSpace(pronouns)
	if len(pronouns) > 50 {
		pronouns = pronouns[:50]
	}

	if username != "" && (len(username) < 3 || len(username) > 24 || !usernamePattern.MatchString(username)) {
		return nil, errors.New("Le nom d'utilisateur doit contenir 3 à 24 caractères : lettres minuscules, chiffres, _ ou ., sans séparateurs consécutifs.")
	}
	if username != "" {
		reserved, err := isReservedIdentifier(ctx, s.pool, "username", username)
		if err != nil {
			return nil, err
		}
		if reserved {
			return nil, errors.New("Ce nom d'utilisateur est réservé.")
		}
		var exists bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM "User" WHERE lower(username) = lower($1) AND id <> $2)`,
			username, toUUID(userID)).Scan(&exists); err != nil {
			return nil, err
		}
		if exists {
			return nil, errors.New("Ce nom d'utilisateur est déjà utilisé.")
		}
	}

	if _, err := s.pool.Exec(ctx, `
		UPDATE "User"
		SET name = $1, username = $2, "onboardingText" = $3, "logoUrl" = $4, pronouns = $5, "updatedAt" = now()
		WHERE id = $6`,
		optText(name), optText(username), optText(onboardingText), optText(logoURL), optText(pronouns),
		toUUID(userID)); err != nil {
		if isUniqueViolation(err) {
			return nil, errors.New("Ce nom d'utilisateur est déjà utilisé.")
		}
		return nil, err
	}
	return s.Profile(ctx, userID)
}

// isReservedIdentifier reads the admin-managed denylist from SystemConfig.
// Values are newline- or comma-separated and compared case-insensitively.
// A missing key falls back to the platform's minimal route denylist.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func isReservedIdentifier(ctx context.Context, pool pooler, kind, value string) (bool, error) {
	var raw string
	err := pool.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key = $1`, "RESERVED_"+strings.ToUpper(kind)+"S").Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		raw = "admin,api,app,auth,billing,blog,cdn,dashboard,dev,developer,developers,docs,download,email,feed,files,help,home,login,mail,main,media,metrics,onboarding,payments,portal,qoe,root,search,settings,staging,start,static,status,store,studio,support,system,uploads,web,www"
	} else if err != nil {
		return false, err
	}
	for _, item := range strings.FieldsFunc(strings.ToLower(raw), func(r rune) bool { return r == ',' || r == '\n' || r == '\r' || r == ' ' }) {
		if item == strings.ToLower(value) {
			return true, nil
		}
	}
	return false, nil
}

// ── Billing lecteur (GET /v1/me/billing) ─────────────────────────────────

// BillingTransaction est une transaction de portefeuille (parité walletTransactions Prisma).
type BillingTransaction struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	AmountCents int32  `json:"amountCents"`
	CreatedAt   string `json:"createdAt"`
}

// BillingPublication est la publication d'un abonnement (parité publication {select} Prisma).
type BillingPublication struct {
	Name    *string `json:"name"`
	LogoURL *string `json:"logoUrl"`
	Slug    string  `json:"slug"`
}

// BillingSubscription est un abonnement premium actif du lecteur.
type BillingSubscription struct {
	ID          string              `json:"id"`
	Publication *BillingPublication `json:"publication"`
}

// BillingData est la réponse de GET /v1/me/billing : portefeuille +
// transactions récentes + abonnements premium actifs (parité
// prisma.user.findUnique(include walletTransactions) + subscriber.findMany).
type BillingData struct {
	WalletBalanceCents int32                 `json:"walletBalanceCents"`
	WalletTransactions []BillingTransaction  `json:"walletTransactions"`
	Subscriptions      []BillingSubscription `json:"subscriptions"`
}

// Billing retourne le portefeuille + historique + abonnements premium actifs.
func (s *Service) Billing(ctx context.Context, userID string) (*BillingData, error) {
	var email string
	var balance int32
	err := s.pool.QueryRow(ctx,
		`SELECT email, "walletBalanceCents" FROM "User" WHERE id = $1`, toUUID(userID)).
		Scan(&email, &balance)
	if err != nil {
		return nil, err
	}

	data := &BillingData{
		WalletBalanceCents: balance,
		WalletTransactions: []BillingTransaction{},
		Subscriptions:      []BillingSubscription{},
	}

	// Transactions récentes (take 10, createdAt DESC — parité Prisma).
	rows, err := s.pool.Query(ctx,
		`SELECT id, type, "amountCents", "createdAt"
		 FROM "WalletTransaction" WHERE "userId" = $1
		 ORDER BY "createdAt" DESC LIMIT 10`, toUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t BillingTransaction
		var createdAt pgtype.Timestamp
		if err := rows.Scan(&t.ID, &t.Type, &t.AmountCents, &createdAt); err != nil {
			continue
		}
		t.CreatedAt = createdAt.Time.Format(time.RFC3339)
		data.WalletTransactions = append(data.WalletTransactions, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Abonnements premium actifs du lecteur (par email — parité Prisma).
	subRows, err := s.pool.Query(ctx, `
		SELECT s.id, p.name, p."logoUrl", p.slug
		FROM "Subscriber" s
		JOIN "Publication" p ON p.id = s."publicationId"
		WHERE s.email = $1 AND s."isPremium" = true AND s."isActive" = true
		ORDER BY s."createdAt" DESC`, email)
	if err != nil {
		return nil, err
	}
	defer subRows.Close()
	for subRows.Next() {
		var s BillingSubscription
		var name, logo pgtype.Text
		var slug string
		if err := subRows.Scan(&s.ID, &name, &logo, &slug); err != nil {
			continue
		}
		s.Publication = &BillingPublication{Name: textPtr(name), LogoURL: textPtr(logo), Slug: slug}
		data.Subscriptions = append(data.Subscriptions, s)
	}
	if err := subRows.Err(); err != nil {
		return nil, err
	}

	return data, nil
}

// optText convertit une chaîne en pgtype.Text ; vide → NULL.
func optText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}

// ── Onboarding lecteur (POST /v1/me/onboarding-complete) ─────────────────

// OnboardingCompleteInput porte les choix d'onboarding du lecteur (parité
// completeOnboardingInDb — packages/db/src/onboarding.ts).
type OnboardingCompleteInput struct {
	Interests        []string `json:"interests"`
	Subtopics        []string `json:"subtopics"`
	OnboardingText   string   `json:"onboardingText"`
	MutedWords       []string `json:"mutedWords"`
	CreatorsToFollow []string `json:"creatorsToFollow"`
	Gender           string   `json:"gender"`
	AgeRange         string   `json:"ageRange"`
	Pronouns         string   `json:"pronouns"`
}

var validGenders = map[string]bool{
	"FEMALE": true, "MALE": true, "NON_BINARY": true, "OTHER": true, "PREFER_NOT_TO_SAY": true,
}
var validAgeRanges = map[string]bool{
	"UNDER_18": true, "AGE_18_24": true, "AGE_25_34": true, "AGE_35_44": true,
	"AGE_45_54": true, "AGE_55_64": true, "AGE_65_PLUS": true, "PREFER_NOT_TO_SAY": true,
}

// OnboardingComplete finalise l'onboarding lecteur : marque le profil,
// calcule l'embedding sémantique (pgvector), enregistre les mots masqués et
// les suivis de créateurs — miroir Go de completeOnboardingInDb.
func (s *Service) OnboardingComplete(ctx context.Context, userID string, in OnboardingCompleteInput) error {
	gender := in.Gender
	if !validGenders[gender] {
		gender = ""
	}
	ageRange := in.AgeRange
	if !validAgeRanges[ageRange] {
		ageRange = ""
	}
	pronouns := strings.TrimSpace(in.Pronouns)
	if len(pronouns) > 50 {
		pronouns = pronouns[:50]
	}

	// 1. Marque l'onboarding terminé + biographie + démographie.
	if gender != "" || ageRange != "" || pronouns != "" {
		if _, err := s.pool.Exec(ctx, `
			UPDATE "User"
			SET "hasCompletedOnboarding" = true,
			    "onboardingText" = COALESCE(NULLIF($1, ''), "onboardingText"),
			    gender = $2, "ageRange" = $3, pronouns = $4, "demographicsUpdatedAt" = now(),
			    "updatedAt" = now()
			WHERE id = $5`, optText(in.OnboardingText), optText(gender), optText(ageRange), optText(pronouns), toUUID(userID)); err != nil {
			return err
		}
	} else {
		if _, err := s.pool.Exec(ctx, `
			UPDATE "User"
			SET "hasCompletedOnboarding" = true,
			    "onboardingText" = COALESCE(NULLIF($1, ''), "onboardingText"),
			    "updatedAt" = now()
			WHERE id = $2`, optText(in.OnboardingText), toUUID(userID)); err != nil {
			return err
		}
	}

	// 2. Embedding sémantique (best-effort : service d'inférence OU fallback
	// déterministe — même comportement que le TS).
	allTopics := append(append([]string{}, in.Interests...), in.Subtopics...)
	if err := s.saveUserEmbedding(ctx, userID, in.OnboardingText, allTopics); err != nil {
		log.Printf("[users] onboarding embedding: %v", err)
	}

	// 3. Mots masqués (skip duplicates — parité createMany skipDuplicates).
	for _, word := range in.MutedWords {
		w := strings.ToLower(strings.TrimSpace(word))
		if w == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "MutedWord" (id, word, "userId", "createdAt")
			VALUES (gen_random_uuid()::text, $1, $2, now())
			ON CONFLICT ("userId", "word") DO NOTHING`, w, toUUID(userID)); err != nil {
			return err
		}
	}

	// 4. Suivis des créateurs choisis (skip duplicates).
	for _, pubID := range in.CreatorsToFollow {
		if pubID == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
			VALUES (gen_random_uuid()::text, $1, $2, now())
			ON CONFLICT ("readerId", "publicationId") DO NOTHING`, toUUID(userID), pubID); err != nil {
			return err
		}
	}

	return nil
}

// saveUserEmbedding calcule l'embedding du profil (prompt parité TS) et
// l'écrit en base. Best-effort : service d'inférence puis fallback
// déterministe 512 dims — ne bloque jamais l'onboarding.
func (s *Service) saveUserEmbedding(ctx context.Context, userID, onboardingText string, topics []string) error {
	intention := onboardingText
	if intention == "" {
		intention = "Lecture attentive et pensée critique"
	}
	prompt := "Intérêts: " + strings.Join(topics, ", ") + " | Intention: " + intention

	vec, err := fetchEmbedding(ctx, prompt)
	if err != nil {
		vec = fallbackMockEmbedding(prompt, topics)
	}
	dims := embeddingDims()
	if len(vec) > dims {
		vec = vec[:dims]
	}
	if len(vec) == 0 {
		return nil
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE "User" SET embedding = $1::vector WHERE id = $2`,
		vectorLiteral(vec), toUUID(userID))
	return err
}

// embeddingDims retourne la dimension cible (MRL) : EMBEDDING_DIMS, défaut 512.
func embeddingDims() int {
	d, _ := strconv.Atoi(os.Getenv("EMBEDDING_DIMS"))
	if d < 64 || d > 4096 {
		d = 512
	}
	return d
}

// fetchEmbedding appelle le service d'inférence (API OpenAI-compatible,
// jina-embeddings-v3 MRL 512) — parité httpEmbedClient du module search.
func fetchEmbedding(ctx context.Context, text string) ([]float32, error) {
	base := os.Getenv("EMBEDDING_URL")
	if base == "" {
		base = "http://localhost:8081"
	}
	model := os.Getenv("EMBEDDING_MODEL")
	if model == "" {
		model = "jina-embeddings-v3"
	}
	payload, _ := json.Marshal(map[string]any{"model": model, "input": text})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimSuffix(base, "/")+"/v1/embeddings", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding service status %d", resp.StatusCode)
	}
	var out struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.Data) == 0 || len(out.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("embedding response vide")
	}
	return out.Data[0].Embedding, nil
}

// fallbackMockEmbedding reproduit generateFallbackMockEmbedding (TS) : un
// vecteur déterministe 512 dims dérivé du texte + intérêts triés.
func fallbackMockEmbedding(text string, interests []string) []float32 {
	sorted := append([]string{}, interests...)
	sort.Strings(sorted)
	seed := text + "|" + strings.Join(sorted, ",")
	var hash uint32
	for i := 0; i < len(seed); i++ {
		hash = hash*31 + uint32(seed[i])
	}
	dims := embeddingDims()
	vec := make([]float32, dims)
	for i := 0; i < dims; i++ {
		x := math.Sin(float64(hash)+float64(i)) * 10000
		v := (x-math.Floor(x))*2 - 1
		vec[i] = float32(v)
	}
	return vec
}

// vectorLiteral formate un vecteur en littéral pgvector '[1,2,3]'.
func vectorLiteral(v []float32) string {
	parts := make([]string, len(v))
	for i, f := range v {
		parts[i] = strconv.FormatFloat(float64(f), 'g', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// ── Export de données (GET /v1/me/data-export) ───────────────────────────

// DataExport construit l'export complet du compte lecteur (GDPR) — miroir
// exportAccountDataAction (settings/actions.ts). Retourne un map sérialisable
// en JSON (dates déjà en RFC3339).
func (s *Service) DataExport(ctx context.Context, userID string) (map[string]any, error) {
	var user struct {
		ID             string
		Email          string
		Name           pgtype.Text
		Username       pgtype.Text
		OnboardingText pgtype.Text
		CreatedAt      pgtype.Timestamp
	}
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, email, name, username, "onboardingText", "createdAt"
		 FROM "User" WHERE id = $1`, toUUID(userID)).
		Scan(&user.ID, &user.Email, &user.Name, &user.Username, &user.OnboardingText, &user.CreatedAt)
	if err != nil {
		return nil, err
	}

	out := map[string]any{
		"exportedAt": time.Now().UTC().Format(time.RFC3339),
		"account": map[string]any{
			"id":             user.ID,
			"email":          user.Email,
			"name":           textPtr(user.Name),
			"username":       textPtr(user.Username),
			"onboardingText": textPtr(user.OnboardingText),
			"createdAt":      user.CreatedAt.Time.Format(time.RFC3339),
		},
	}

	out["settings"] = s.exportRow(ctx, `SELECT * FROM "UserSettings" WHERE "userId" = $1`, toUUID(userID))
	out["notificationPreferences"] = s.exportRow(ctx, `SELECT * FROM "NotificationPreference" WHERE "userId" = $1`, toUUID(userID))
	out["thoughts"] = s.exportRows(ctx, `SELECT * FROM "Post" WHERE "authorId" = $1 ORDER BY "createdAt" ASC`, toUUID(userID))
	out["articles"] = s.exportRows(ctx, `SELECT id, title, slug, content, published, "createdAt", "updatedAt" FROM "Article" WHERE "authorId" = $1 ORDER BY "createdAt" ASC`, toUUID(userID))
	out["highlights"] = s.exportRows(ctx, `SELECT * FROM "Highlight" WHERE "readerId" = $1 ORDER BY "createdAt" ASC`, toUUID(userID))
	out["bookmarks"] = s.exportRows(ctx, `SELECT * FROM "Bookmark" WHERE "readerId" = $1 ORDER BY "createdAt" ASC`, toUUID(userID))
	out["follows"] = s.exportRows(ctx, `SELECT "publicationId", "createdAt" FROM "Follows" WHERE "readerId" = $1 ORDER BY "createdAt" ASC`, toUUID(userID))

	return out, nil
}

// exportRow renvoie la première ligne d'une requête en map (nil si absente).
func (s *Service) exportRow(ctx context.Context, query string, args ...any) map[string]any {
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	if !rows.Next() {
		return nil
	}
	return rowToMap(rows)
}

// exportRows renvoie toutes les lignes d'une requête en []map.
func (s *Service) exportRows(ctx context.Context, query string, args ...any) []map[string]any {
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		if m := rowToMap(rows); m != nil {
			out = append(out, m)
		}
	}
	return out
}

// rowToMap convertit la ligne courante en map[string]any JSON-friendly
// (times → RFC3339, bytes → hex, null → nil).
func rowToMap(rows pgx.Rows) map[string]any {
	cols := rows.FieldDescriptions()
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range cols {
		ptrs[i] = &vals[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil
	}
	m := make(map[string]any, len(cols))
	for i, c := range cols {
		m[string(c.Name)] = jsonFriendly(vals[i])
	}
	return m
}

// jsonFriendly normalise les valeurs pgx vers du JSON propre.
func jsonFriendly(v any) any {
	switch t := v.(type) {
	case time.Time:
		return t.Format(time.RFC3339)
	case []byte:
		return string(t)
	case pgtype.UUID:
		return uuidString(t)
	case *string:
		if t == nil {
			return nil
		}
		return *t
	default:
		return v
	}
}

// uuidString formate un pgtype.UUID en chaîne canonique.
func uuidString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", u.Bytes[0:4], u.Bytes[4:6], u.Bytes[6:8], u.Bytes[8:10], u.Bytes[10:16])
}
