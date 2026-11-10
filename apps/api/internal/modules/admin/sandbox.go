package admin

// =====================================================================
// 🏖️ sandbox.go — Bac à sable, seeds & impersonation contrôlée (Lot D6)
// =====================================================================
// Permet aux opérateurs et au contrôle qualité de tester la plateforme
// en toute sécurité sans impacter les comptes de production :
//   - Génération de scénarios de seed ciblés (lecteur, média, modération, outbox, DSAR)
//   - Prise d'identité contrôlée (impersonation) avec motif obligatoire
//     et traçabilité inconditionnelle dans AdminAuditLog.
// =====================================================================

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/qoefi/api/internal/response"
)

type SandboxScenarioInfo struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	TargetFile  string   `json:"targetFile"`
	Entities    []string `json:"entities"`
}

var availableSandboxScenarios = []SandboxScenarioInfo{
	{
		ID:          "cold_start_reader",
		Title:       "Lecteur Cold Start (Nouveau Compte)",
		Description: "Génère un profil lecteur vierge sans abonnements ni historique de lecture pour valider l'onboarding et l'algorithme de découverte.",
		TargetFile:  "Utilisateurs & Profils",
		Entities:    []string{"User"},
	},
	{
		ID:          "active_media",
		Title:       "Média & Publisher Active",
		Description: "Génère une publication avec articles publiés, abonnés et statistiques de lecture pour tester la consultation média et le studio.",
		TargetFile:  "Médias & Abonnements",
		Entities:    []string{"User", "Publisher", "Article", "Subscriber"},
	},
	{
		ID:          "moderation_incident",
		Title:       "Dossier de Modération & Signalement",
		Description: "Crée un signalement abusif en attente (spam/harcèlement) pour alimenter la file de triage et tester les mesures de suspension.",
		TargetFile:  "File de modération (/admin/reports & /admin/work)",
		Entities:    []string{"User", "ModerationReport"},
	},
	{
		ID:          "outbox_failure_wave",
		Title:       "Vague d'échecs Boîte d'envoi (Outbox)",
		Description: "Injecte 3 livraisons en échec avec erreurs de connexion SMTP simulées pour tester la supervision, le déblocage et la relance.",
		TargetFile:  "Outbox (/admin/notifications)",
		Entities:    []string{"Notification", "NotificationDelivery"},
	},
	{
		ID:          "dsar_request_pending",
		Title:       "Demande d'Effacement RGPD (DSAR)",
		Description: "Inscrit une demande d'effacement en attente à échéance 7 jours pour tester le compte à rebours de conformité et l'effacement définitif.",
		TargetFile:  "Conformité (/admin/compliance)",
		Entities:    []string{"User", "AccountDeletionRequest"},
	},
}

type SeedScenarioResult struct {
	Success        bool           `json:"success"`
	Scenario       string         `json:"scenario"`
	GeneratedCount int            `json:"generatedCount"`
	Message        string         `json:"message"`
	Entities       map[string]any `json:"entities"`
}

// ExecuteSeedScenario exécute de manière isolée un scénario de test.
func (s *Service) ExecuteSeedScenario(ctx context.Context, staffID, scenario string, count int) (*SeedScenarioResult, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("base de données non disponible")
	}

	if count <= 0 || count > 20 {
		count = 1
	}

	res := &SeedScenarioResult{
		Success:  true,
		Scenario: scenario,
		Entities: make(map[string]any),
	}

	rnd := time.Now().UnixNano() % 100000

	switch scenario {
	case "cold_start_reader":
		uID := uuid.New().String()
		email := fmt.Sprintf("reader.cold.%d@qoe.test", rnd)
		username := fmt.Sprintf("reader_%d", rnd)
		name := fmt.Sprintf("Lecteur Sandbox %d", rnd)

		_, err := s.pool.Exec(ctx, `
			INSERT INTO "User" ("id", "email", "username", "name", "role", "createdAt", "updatedAt")
			VALUES ($1::uuid, $2, $3, $4, 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			uID, email, username, name)
		if err != nil {
			return nil, fmt.Errorf("création lecteur sandbox: %w", err)
		}

		res.GeneratedCount = 1
		res.Message = fmt.Sprintf("Lecteur cold start créé : %s (%s)", name, email)
		res.Entities["userId"] = uID
		res.Entities["email"] = email

	case "active_media":
		uID := uuid.New().String()
		email := fmt.Sprintf("media.sandbox.%d@qoe.test", rnd)
		username := fmt.Sprintf("media_%d", rnd)
		name := fmt.Sprintf("Média Sandbox %d", rnd)

		_, err := s.pool.Exec(ctx, `
			INSERT INTO "User" ("id", "email", "username", "name", "role", "createdAt", "updatedAt")
			VALUES ($1::uuid, $2, $3, $4, 'creator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			uID, email, username, name)
		if err != nil {
			return nil, fmt.Errorf("création créateur sandbox: %w", err)
		}

		pubID := uuid.New().String()
		_, err = s.pool.Exec(ctx, `
			INSERT INTO "Publisher" ("id", "name", "slug", "ownerId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			pubID, name, username, uID)
		if err == nil {
			// Article exemple
			artID := uuid.New().String()
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "Article" ("id", "title", "slug", "status", "authorId", "publisherId", "content", "publishedAt", "createdAt", "updatedAt")
				VALUES ($1, 'Édition Spéciale Sandbox', $2, 'published', $3::uuid, $4, '{"type":"doc","content":[]}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				artID, fmt.Sprintf("edition-sandbox-%d", rnd), uID, pubID)
		}

		res.GeneratedCount = 2
		res.Message = fmt.Sprintf("Média actif créé avec publication et article : %s", email)
		res.Entities["userId"] = uID
		res.Entities["email"] = email
		res.Entities["publisherId"] = pubID

	case "moderation_incident":
		reporterID := uuid.New().String()
		targetUserID := uuid.New().String()
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO "User" ("id", "email", "username", "name", "role", "createdAt", "updatedAt")
			VALUES ($1::uuid, $2, $3, 'Cible Signalement', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			targetUserID, fmt.Sprintf("target.%d@qoe.test", rnd), fmt.Sprintf("target_%d", rnd))

		_, _ = s.pool.Exec(ctx, `
			INSERT INTO "User" ("id", "email", "username", "name", "role", "createdAt", "updatedAt")
			VALUES ($1::uuid, $2, $3, 'Auteur Signalement', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			reporterID, fmt.Sprintf("reporter.%d@qoe.test", rnd), fmt.Sprintf("reporter_%d", rnd))

		reportID := fmt.Sprintf("rep_sbx_%d", rnd)
		_, err := s.pool.Exec(ctx, `
			INSERT INTO "ModerationReport" ("id", "reporterId", "targetId", "targetType", "reason", "details", "status", "createdAt", "updatedAt")
			VALUES ($1, $2::uuid, $3, 'user', 'spam', 'Activité suspecte répétée simulée en sandbox', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			reportID, reporterID, targetUserID)
		if err != nil {
			return nil, fmt.Errorf("création signalement sandbox: %w", err)
		}

		res.GeneratedCount = 1
		res.Message = fmt.Sprintf("Dossier de signalement en attente créé : #%s (raison : spam)", reportID)
		res.Entities["reportId"] = reportID
		res.Entities["targetUserId"] = targetUserID

	case "outbox_failure_wave":
		uID := uuid.New().String()
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO "User" ("id", "email", "username", "name", "role", "createdAt", "updatedAt")
			VALUES ($1::uuid, $2, $3, 'Outbox Testeur', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			uID, fmt.Sprintf("outbox.tester.%d@qoe.test", rnd), fmt.Sprintf("tester_%d", rnd))

		notifID := fmt.Sprintf("notif_sbx_%d", rnd)
		_, err := s.pool.Exec(ctx, `
			INSERT INTO "Notification" ("id", "userId", "type", "createdAt", "updatedAt")
			VALUES ($1, $2::uuid, 'system_alert', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			notifID, uID)
		if err != nil {
			return nil, fmt.Errorf("création notification sandbox: %w", err)
		}

		for i := 1; i <= 3; i++ {
			delivID := fmt.Sprintf("deliv_sbx_%d_%d", rnd, i)
			dedupe := fmt.Sprintf("dedupe_sbx_%d_%d", rnd, i)
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "NotificationDelivery" ("id", "notificationId", "channel", "status", "recipient", "attempts", "lastError", "dedupeKey", "createdAt", "updatedAt")
				VALUES ($1, $2, 'EMAIL', 'FAILED', $3, 3, 'Simulation sandbox : SMTP timeout 30s', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				delivID, notifID, fmt.Sprintf("fail.%d.%d@qoe.test", rnd, i), dedupe)
		}

		res.GeneratedCount = 3
		res.Message = "3 livraisons en échec injectées dans l'outbox avec erreur SMTP simulée"
		res.Entities["notificationId"] = notifID

	case "dsar_request_pending":
		uID := uuid.New().String()
		email := fmt.Sprintf("dsar.user.%d@qoe.test", rnd)
		username := fmt.Sprintf("dsar_%d", rnd)

		_, err := s.pool.Exec(ctx, `
			INSERT INTO "User" ("id", "email", "username", "name", "role", "createdAt", "updatedAt")
			VALUES ($1::uuid, $2, $3, 'Demandeur DSAR', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			uID, email, username)
		if err != nil {
			return nil, fmt.Errorf("création utilisateur DSAR sandbox: %w", err)
		}

		reqID := fmt.Sprintf("dsar_sbx_%d", rnd)
		_, err = s.pool.Exec(ctx, `
			INSERT INTO "AccountDeletionRequest" ("id", "userId", "status", "reason", "requestedAt")
			VALUES ($1, $2::uuid, 'PENDING', 'Demande d’effacement Art. 17 injectée en sandbox', CURRENT_TIMESTAMP - interval '23 days')`,
			reqID, uID)
		if err != nil {
			return nil, fmt.Errorf("création requête DSAR sandbox: %w", err)
		}

		res.GeneratedCount = 1
		res.Message = fmt.Sprintf("Demande d'effacement RGPD créée pour %s (échéance dans 7 jours)", email)
		res.Entities["requestId"] = reqID
		res.Entities["userId"] = uID

	default:
		return nil, fmt.Errorf("scénario inconnu : %s", scenario)
	}

	s.logAudit(ctx, staffID, "sandbox.seed_scenario", "system", scenario, map[string]any{
		"scenario":       scenario,
		"generatedCount": res.GeneratedCount,
		"entities":       res.Entities,
	})

	return res, nil
}

type ImpersonateResult struct {
	UserID       string `json:"userId"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	Role         string `json:"role"`
	ReaderURL    string `json:"readerUrl"`
	Message      string `json:"message"`
	Impersonated bool   `json:"impersonated"`
}

// ImpersonateUser prépare et audite de manière inconditionnelle la prise d'identité.
func (s *Service) ImpersonateUser(ctx context.Context, staffID, targetEmail, reason string) (*ImpersonateResult, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("base de données non disponible")
	}

	trimmedEmail := strings.TrimSpace(strings.ToLower(targetEmail))
	if trimmedEmail == "" {
		return nil, errors.New("l'adresse email du compte à endosser est obligatoire")
	}

	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason == "" {
		return nil, errors.New("un motif d'audit ou de support est strictement obligatoire pour l'impersonation")
	}

	var (
		uID, email, name, role string
	)

	err := s.pool.QueryRow(ctx, `
		SELECT "id"::text, "email", COALESCE("name", ''), "role"
		  FROM "User"
		 WHERE LOWER("email") = $1
		 LIMIT 1`, trimmedEmail).Scan(&uID, &email, &name, &role)
	if err != nil {
		return nil, fmt.Errorf("utilisateur introuvable pour %s", trimmedEmail)
	}

	// Journalisation inconditionnelle de la prise d'identité
	s.logAudit(ctx, staffID, "impersonation.start", "user", uID, map[string]any{
		"targetEmail": email,
		"targetRole":  role,
		"reason":      trimmedReason,
	})

	return &ImpersonateResult{
		UserID:       uID,
		Email:        email,
		Name:         name,
		Role:         role,
		ReaderURL:    fmt.Sprintf("/home?impersonate=%s", uID),
		Message:      fmt.Sprintf("Identité endossée pour %s (%s) — accès audité.", email, role),
		Impersonated: true,
	}, nil
}

// ── HTTP Handlers ──────────────────────────────────────────────────────────

// GET /v1/admin/sandbox/scenarios
func (h *Handler) listSandboxScenarios(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	response.OK(w, map[string]any{
		"scenarios": availableSandboxScenarios,
	})
}

type SeedScenarioInput struct {
	Scenario string `json:"scenario"`
	Count    int    `json:"count,omitempty"`
}

// POST /v1/admin/sandbox/seed
func (h *Handler) runSandboxSeed(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in SeedScenarioInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Scenario == "" {
		response.BadRequest(w, "scénario de seed requis")
		return
	}

	res, err := h.svc.ExecuteSeedScenario(r.Context(), staffID, in.Scenario, in.Count)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, res)
}

type ImpersonateInput struct {
	Email  string `json:"email"`
	Reason string `json:"reason"`
}

// POST /v1/admin/sandbox/impersonate
func (h *Handler) runImpersonate(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in ImpersonateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Email == "" {
		response.BadRequest(w, "email et motif requis pour l'impersonation")
		return
	}

	res, err := h.svc.ImpersonateUser(r.Context(), staffID, in.Email, in.Reason)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, res)
}
