package admin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/response"
)

var (
	errInvalidDSAR  = errors.New("demande DSAR invalide")
	errUserNotFound = errors.New("utilisateur introuvable")
)

// DeletionRequestDTO représente une demande d'effacement de compte RGPD (Art. 17).
type DeletionRequestDTO struct {
	ID            string  `json:"id"`
	UserID        string  `json:"userId"`
	UserEmail     string  `json:"userEmail"`
	UserName      *string `json:"userName"`
	Status        string  `json:"status"`
	Reason        *string `json:"reason"`
	RequestedAt   string  `json:"requestedAt"`
	ProcessedAt   *string `json:"processedAt,omitempty"`
	DaysRemaining int     `json:"daysRemaining"`
	IsUrgent      bool    `json:"isUrgent"`
}

// DSARExportDTO représente l'export complet de données personnelles d'un utilisateur.
type DSARExportDTO struct {
	ExportedAt       string           `json:"exportedAt"`
	UserID           string           `json:"userId"`
	ChecksumSha256   string           `json:"checksumSha256"`
	LegalNotice      string           `json:"legalNotice"`
	Account          map[string]any   `json:"account"`
	Settings         map[string]any   `json:"settings"`
	Consents         []map[string]any `json:"consents"`
	FeatureInterests []map[string]any `json:"featureInterests"`
	Subscriptions    []map[string]any `json:"subscriptions"`
	Activity         map[string]any   `json:"activity"`
}

// EraseUserInput est le corps de requête pour exécuter l'effacement définitif.
type EraseUserInput struct {
	Reason    string  `json:"reason"`
	RequestID *string `json:"requestId,omitempty"`
}

// ErasureReceiptDTO est l'attestation légale d'effacement délivrée après purge.
type ErasureReceiptDTO struct {
	ReceiptID   string `json:"receiptId"`
	UserID      string `json:"userId"`
	EmailHash   string `json:"emailHash"`
	Reason      string `json:"reason"`
	ErasedAt    string `json:"erasedAt"`
	ProofSha256 string `json:"proofSha256"`
}

func toDSARUUID(s string) pgtype.UUID {
	var u pgtype.UUID
	_ = u.Scan(s)
	return u
}

func dsarUUIDString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	src := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", src[0:4], src[4:6], src[6:8], src[8:10], src[10:16])
}

func jsonFriendly(v any) any {
	switch t := v.(type) {
	case time.Time:
		return t.Format(time.RFC3339)
	case []byte:
		return string(t)
	case pgtype.UUID:
		return dsarUUIDString(t)
	case *string:
		if t == nil {
			return nil
		}
		return *t
	default:
		return v
	}
}

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

// ListDeletionRequests liste les demandes d'effacement de compte avec délai restant légal.
func (s *Service) ListDeletionRequests(ctx context.Context) ([]DeletionRequestDTO, error) {
	if s.pool == nil {
		return []DeletionRequestDTO{}, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r."userId"::text, coalesce(u.email, 'inconnu@deleted.local'), u.name,
		       r.status, r.reason, r."requestedAt", r."processedAt"
		FROM "AccountDeletionRequest" r
		LEFT JOIN "User" u ON u.id = r."userId"
		ORDER BY r."requestedAt" DESC
		LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []DeletionRequestDTO{}
	now := time.Now().UTC()
	for rows.Next() {
		var item DeletionRequestDTO
		var name pgtype.Text
		var reason pgtype.Text
		var reqAt pgtype.Timestamp
		var procAt pgtype.Timestamp

		if err := rows.Scan(&item.ID, &item.UserID, &item.UserEmail, &name,
			&item.Status, &reason, &reqAt, &procAt); err != nil {
			return nil, err
		}
		if name.Valid {
			item.UserName = &name.String
		}
		if reason.Valid {
			item.Reason = &reason.String
		}
		if reqAt.Valid {
			item.RequestedAt = reqAt.Time.UTC().Format(time.RFC3339)
			deadline := reqAt.Time.UTC().Add(30 * 24 * time.Hour)
			days := int(deadline.Sub(now).Hours() / 24)
			item.DaysRemaining = days
			item.IsUrgent = item.Status == "PENDING" && days <= 7
		}
		if procAt.Valid {
			tStr := procAt.Time.UTC().Format(time.RFC3339)
			item.ProcessedAt = &tStr
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// ExportUserDSAR rassemble l'ensemble des données personnelles d'un utilisateur et scelle le paquet.
func (s *Service) ExportUserDSAR(ctx context.Context, staffID, userID, reason string) (*DSARExportDTO, []byte, error) {
	if s.pool == nil {
		return nil, nil, errors.New("base de données indisponible")
	}

	var user struct {
		ID             string
		Email          string
		Name           pgtype.Text
		Username       pgtype.Text
		Role           string
		OnboardingText pgtype.Text
		CreatedAt      pgtype.Timestamp
	}
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email, name, username, role, "onboardingText", "createdAt"
		FROM "User" WHERE id = $1`, toDSARUUID(userID)).
		Scan(&user.ID, &user.Email, &user.Name, &user.Username, &user.Role, &user.OnboardingText, &user.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, errUserNotFound
		}
		return nil, nil, err
	}

	accountMap := map[string]any{
		"id":             user.ID,
		"email":          user.Email,
		"name":           textPtr(user.Name),
		"username":       textPtr(user.Username),
		"role":           user.Role,
		"onboardingText": textPtr(user.OnboardingText),
		"createdAt":      user.CreatedAt.Time.UTC().Format(time.RFC3339),
	}

	settingsMap := s.exportRow(ctx, `SELECT * FROM "UserSettings" WHERE "userId" = $1`, toDSARUUID(userID))
	if settingsMap == nil {
		settingsMap = map[string]any{}
	}

	consents := s.exportRows(ctx, `
		SELECT "documentSlug", "versionId", "acceptedAt", "ipAddress"
		FROM "LegalAcceptance"
		WHERE "userId" = $1
		ORDER BY "acceptedAt" DESC`, toDSARUUID(userID))

	features := s.exportRows(ctx, `
		SELECT "featureKey", "status", "source", "consentAt", "createdAt"
		FROM "FeatureInterest"
		WHERE "userId" = $1::uuid
		ORDER BY "createdAt" ASC`, userID)

	subscriptions := s.exportRows(ctx, `
		SELECT id, "publicationId", email, confirmed, "createdAt"
		FROM "Subscriber"
		WHERE "userId" = $1
		ORDER BY "createdAt" DESC`, toDSARUUID(userID))

	var articlesCount, postsCount, highlightsCount, bookmarksCount, readingCount int
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "Article" WHERE "authorId" = $1`, toDSARUUID(userID)).Scan(&articlesCount)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "Post" WHERE "authorId" = $1`, toDSARUUID(userID)).Scan(&postsCount)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "Highlight" WHERE "readerId" = $1`, toDSARUUID(userID)).Scan(&highlightsCount)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "Bookmark" WHERE "readerId" = $1`, toDSARUUID(userID)).Scan(&bookmarksCount)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "ReadingSession" WHERE "userId" = $1`, toDSARUUID(userID)).Scan(&readingCount)

	activityMap := map[string]any{
		"articlesCount":   articlesCount,
		"postsCount":      postsCount,
		"highlightsCount": highlightsCount,
		"bookmarksCount":  bookmarksCount,
		"readingSessions": readingCount,
	}

	nowISO := time.Now().UTC().Format(time.RFC3339)
	dto := &DSARExportDTO{
		ExportedAt:       nowISO,
		UserID:           userID,
		LegalNotice:      "Export nominatif produit au titre du droit d'accès RGPD (Art. 15). Preuve horodatée et scellée.",
		Account:          accountMap,
		Settings:         settingsMap,
		Consents:         consents,
		FeatureInterests: features,
		Subscriptions:    subscriptions,
		Activity:         activityMap,
	}

	tempBytes, err := json.Marshal(dto)
	if err != nil {
		return nil, nil, err
	}
	hasher := sha256.New()
	hasher.Write(tempBytes)
	checksum := hex.EncodeToString(hasher.Sum(nil))
	dto.ChecksumSha256 = checksum

	finalBytes, err := json.MarshalIndent(dto, "", "  ")
	if err != nil {
		return nil, nil, err
	}

	s.logAudit(ctx, staffID, "dsar.export", "user", userID, map[string]any{
		"reason":   reason,
		"checksum": checksum,
	})

	return dto, finalBytes, nil
}

// EraseUser exécute l'effacement d'un compte conformément à l'article 17 du RGPD.
func (s *Service) EraseUser(ctx context.Context, staffID, userID string, in EraseUserInput) (*ErasureReceiptDTO, error) {
	if s.pool == nil {
		return nil, errors.New("base de données indisponible")
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		return nil, fmt.Errorf("%w: le motif de l'effacement est obligatoire", errInvalidDSAR)
	}

	var email string
	err := s.pool.QueryRow(ctx, `SELECT email FROM "User" WHERE id = $1`, toDSARUUID(userID)).Scan(&email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errUserNotFound
		}
		return nil, err
	}

	// Calcul du hash d'opposition
	h := sha256.New()
	h.Write([]byte(strings.ToLower(strings.TrimSpace(email))))
	emailHash := hex.EncodeToString(h.Sum(nil))

	// Inscription en liste d'opposition globale pour bloquer toute communication future
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO "EmailSuppression" (id, email, scope, reason, source, "createdAt")
		VALUES (gen_random_uuid()::text, $1, 'global', 'manual', 'dsar_erasure', now())`,
		email)

	// Mise à jour de la demande d'effacement si fournie
	if in.RequestID != nil && strings.TrimSpace(*in.RequestID) != "" {
		_, _ = s.pool.Exec(ctx, `
			UPDATE "AccountDeletionRequest"
			SET status = 'PROCESSED', "processedAt" = now()
			WHERE id = $1`, strings.TrimSpace(*in.RequestID))
	} else {
		_, _ = s.pool.Exec(ctx, `
			UPDATE "AccountDeletionRequest"
			SET status = 'PROCESSED', "processedAt" = now()
			WHERE "userId" = $1 AND status IN ('PENDING', 'PROCESSING')`, toDSARUUID(userID))
	}

	// Suppression en cascade de l'utilisateur
	_, err = s.pool.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, toDSARUUID(userID))
	if err != nil {
		return nil, fmt.Errorf("suppression du compte: %w", err)
	}

	nowISO := time.Now().UTC().Format(time.RFC3339)
	receiptID := fmt.Sprintf("rec_erase_%d", time.Now().UnixMilli())
	proofSum := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%s:%s", receiptID, userID, emailHash, nowISO)))
	proofHex := hex.EncodeToString(proofSum[:])

	receipt := &ErasureReceiptDTO{
		ReceiptID:   receiptID,
		UserID:      userID,
		EmailHash:   emailHash,
		Reason:      reason,
		ErasedAt:    nowISO,
		ProofSha256: proofHex,
	}

	s.logAudit(ctx, staffID, "dsar.erasure", "user", userID, map[string]any{
		"receiptId": receiptID,
		"emailHash": emailHash,
		"reason":    reason,
		"proof":     proofHex,
	})

	return receipt, nil
}

// ── Handlers HTTP console admin ──────────────────────────────────────────────

func (h *Handler) listDeletionRequests(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	items, err := h.svc.ListDeletionRequests(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"requests": items})
}

func (h *Handler) exportUserDSAR(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	userID := chi.URLParam(r, "userID")
	var in struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	reason := in.Reason
	if strings.TrimSpace(reason) == "" {
		reason = "Demande d'export RGPD"
	}

	dto, bytes, err := h.svc.ExportUserDSAR(r.Context(), staffID, userID, reason)
	if err != nil {
		if errors.Is(err, errUserNotFound) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		h.handleErr(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Qoe-DSAR-Hash", dto.ChecksumSha256)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="dsar-user-%s-%d.json"`, userID, time.Now().Unix()))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(bytes)
}

func (h *Handler) eraseUser(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	userID := chi.URLParam(r, "userID")
	var in EraseUserInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	receipt, err := h.svc.EraseUser(r.Context(), staffID, userID, in)
	if err != nil {
		if errors.Is(err, errInvalidDSAR) {
			response.BadRequest(w, err.Error())
			return
		}
		if errors.Is(err, errUserNotFound) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, receipt)
}
