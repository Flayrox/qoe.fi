package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/response"
)

var (
	errInvalidAnnouncement = errors.New("annonce invalide")
)

// GlobalAnnouncementDTO représente la bannière d'annonce globale.
type GlobalAnnouncementDTO struct {
	ID        string  `json:"id"`
	Active    bool    `json:"active"`
	Message   string  `json:"message"`
	Type      string  `json:"type"`
	LinkURL   *string `json:"linkUrl,omitempty"`
	LinkText  *string `json:"linkText,omitempty"`
	UpdatedAt string  `json:"updatedAt,omitempty"`
}

// SetAnnouncementInput est la charge utile attendue pour modifier l'annonce.
type SetAnnouncementInput struct {
	ID       string  `json:"id"`
	Active   bool    `json:"active"`
	Message  string  `json:"message"`
	Type     string  `json:"type"`
	LinkURL  *string `json:"linkUrl,omitempty"`
	LinkText *string `json:"linkText,omitempty"`
}

// GetGlobalAnnouncement lit l'annonce globale depuis SystemConfig pour la console admin.
// Contrairement à /v1/home/announcement qui renvoie null si l'annonce est inactive,
// la console admin renvoie l'annonce courante (même inactive) pour permettre son édition.
func (s *Service) GetGlobalAnnouncement(ctx context.Context) (*GlobalAnnouncementDTO, error) {
	if s.pool == nil {
		return nil, nil
	}
	var raw string
	err := s.pool.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key = 'GLOBAL_ANNOUNCEMENT'`).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	var dto GlobalAnnouncementDTO
	if err := json.Unmarshal([]byte(raw), &dto); err != nil {
		return nil, nil
	}
	return &dto, nil
}

// SetGlobalAnnouncement enregistre l'annonce globale dans SystemConfig et trace l'audit.
func (s *Service) SetGlobalAnnouncement(ctx context.Context, staffID string, in SetAnnouncementInput) (*GlobalAnnouncementDTO, error) {
	if s.pool == nil {
		return nil, errors.New("base de données indisponible")
	}
	msg := strings.TrimSpace(in.Message)
	if in.Active && msg == "" {
		return nil, fmt.Errorf("%w: le message est obligatoire quand l'annonce est active", errInvalidAnnouncement)
	}
	annType := strings.TrimSpace(in.Type)
	switch annType {
	case "promo", "info", "warning", "critical":
	default:
		annType = "promo"
	}

	id := strings.TrimSpace(in.ID)
	if id == "" {
		id = fmt.Sprintf("ann_%d", time.Now().UnixMilli())
	}

	var linkURL *string
	if in.LinkURL != nil {
		trimmed := strings.TrimSpace(*in.LinkURL)
		if trimmed != "" {
			linkURL = &trimmed
		}
	}
	var linkText *string
	if in.LinkText != nil {
		trimmed := strings.TrimSpace(*in.LinkText)
		if trimmed != "" {
			linkText = &trimmed
		}
	}

	nowISO := time.Now().UTC().Format(time.RFC3339)
	dto := &GlobalAnnouncementDTO{
		ID:        id,
		Active:    in.Active,
		Message:   msg,
		Type:      annType,
		LinkURL:   linkURL,
		LinkText:  linkText,
		UpdatedAt: nowISO,
	}

	bytes, err := json.Marshal(dto)
	if err != nil {
		return nil, err
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO "SystemConfig" (key, value, description, "updatedAt")
		VALUES ('GLOBAL_ANNOUNCEMENT', $1, 'Bannière de notification globale diffusée en haut d’écran', now())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
		string(bytes))
	if err != nil {
		return nil, err
	}

	s.logAudit(ctx, staffID, "announcement.update", "communication", "GLOBAL_ANNOUNCEMENT", map[string]any{
		"id":     dto.ID,
		"active": dto.Active,
		"type":   dto.Type,
	})

	return dto, nil
}

// ── Handlers HTTP console admin ──────────────────────────────────────────────

func (h *Handler) getAnnouncement(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	dto, err := h.svc.GetGlobalAnnouncement(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, dto)
}

func (h *Handler) setAnnouncement(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in SetAnnouncementInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	dto, err := h.svc.SetGlobalAnnouncement(r.Context(), staffID, in)
	if err != nil {
		if errors.Is(err, errInvalidAnnouncement) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, dto)
}
