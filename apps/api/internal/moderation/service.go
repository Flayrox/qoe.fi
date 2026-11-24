package moderation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/resilience"
	"github.com/qoefi/api/internal/trust"
)

const (
	defaultOpenAIBaseURL = "https://api.openai.com/v1"
	moderationModel      = "omni-moderation-latest"
)

// Service orchestre la modération synchrone (fast-path) et le dépistage
// multimodal asynchrone via OpenAI omni-moderation-latest + PolicyV3.
type Service struct {
	pool       *pgxpool.Pool
	ac         *asynq.Client
	openAIKey  string
	openAIBase string
	httpClient *http.Client
	cbOnce     sync.Once
	cb         *resilience.CircuitBreaker
}

// NewService crée l'entonnoir de modération (OpenAI activé si OPENAI_API_KEY est défini).
func NewService(pool *pgxpool.Pool, ac *asynq.Client) *Service {
	return &Service{
		pool:       pool,
		ac:         ac,
		openAIKey:  strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		openAIBase: defaultOpenAIBaseURL,
		httpClient: &http.Client{Timeout: 8 * time.Second},
	}
}

// SetOpenAIConfig configure l'endpoint OpenAI (tests / surcharge).
func (s *Service) SetOpenAIConfig(apiKey, baseURL string, client *http.Client) {
	s.openAIKey = strings.TrimSpace(apiKey)
	if base := strings.TrimSpace(baseURL); base != "" {
		s.openAIBase = strings.TrimSuffix(base, "/")
	}
	if client != nil {
		s.httpClient = client
	}
}

func (s *Service) breaker() *resilience.CircuitBreaker {
	if s.cb != nil {
		return s.cb
	}
	s.cbOnce.Do(func() {
		s.cb = resilience.NewCircuitBreaker(resilience.Options{
			Name:             "openai-moderation",
			FailureThreshold: 5,
			Cooldown:         30 * time.Second,
			CallTimeout:      8 * time.Second,
		})
	})
	return s.cb
}

// CheckSync exécute le fast-path déterministe (< 1 ms) et décide si un
// dépistage IA asynchrone doit être déclenché (flag heuristique, compte Restricted/Low
// ou signalement utilisateur).
func (s *Service) CheckSync(_ context.Context, in CheckInput) Verdict {
	surface := in.Surface
	if surface == "" {
		surface = SurfacePost
	}

	verdict := ScanFastPath(in.Text)
	if verdict.Blocked() {
		observability.Default().IncModerationDecision(surface, string(ActionBlock))
		return verdict
	}

	needsAsync := verdict.Action == ActionFlag ||
		surface == SurfaceUserReport ||
		in.TrustTier == trust.TierRestricted ||
		in.TrustTier == trust.TierLow

	if needsAsync {
		verdict.AsyncScreen = true
	}

	if verdict.Action == ActionFlag {
		observability.Default().IncModerationDecision(surface, string(ActionFlag))
	} else {
		observability.Default().IncModerationDecision(surface, string(ActionAllow))
	}

	return verdict
}

// EnqueueScreen enfile un job TaskModerationScreen pour revue asynchrone.
// Best-effort : si asynq n'est pas configuré, ignore silencieusement.
func (s *Service) EnqueueScreen(in CheckInput) {
	if s == nil || s.ac == nil {
		return
	}
	payload, err := json.Marshal(queue.ModerationScreenPayload{
		Surface:   in.Surface,
		SubjectID: in.SubjectID,
		UserID:    in.UserID,
		Text:      in.Text,
		MediaURLs: in.MediaURLs,
	})
	if err != nil {
		return
	}
	_, _ = s.ac.Enqueue(
		asynq.NewTask(queue.TaskModerationScreen, payload),
		asynq.Queue("default"),
		asynq.MaxRetry(3),
	)
}

// ScreenResult résume le retour d'OpenAI omni-moderation-latest.
type ScreenResult struct {
	Flagged          bool
	Categories       []string
	IsCSAM           bool
	IsSevereHarm     bool
	HighestScore     float64
	DegradedFailOpen bool
}

// ScreenAsync exécute le dépistage complet (heuristiques + OpenAI omni-moderation-latest)
// et alimente internal/abuse + SecurityEvent si le contenu est signalé.
func (s *Service) ScreenAsync(ctx context.Context, p queue.ModerationScreenPayload) (ScreenResult, error) {
	surface := p.Surface
	if surface == "" {
		surface = SurfacePost
	}

	fast := ScanFastPath(p.Text)
	if fast.Blocked() {
		s.recordSevereFinding(ctx, surface, p.UserID, p.SubjectID, []string{fast.ReasonCode}, fast.Reason)
		return ScreenResult{Flagged: true, Categories: []string{fast.ReasonCode}, IsSevereHarm: true}, nil
	}

	if !hasActiveOpenAIKey(s.openAIKey) || (strings.TrimSpace(p.Text) == "" && len(p.MediaURLs) == 0) {
		return ScreenResult{}, nil
	}

	res, err := s.callOpenAI(ctx, p.Text, p.MediaURLs)
	if err != nil {
		log.Printf("[moderation] omni-moderation indisponible (%s/%s): %v", surface, p.SubjectID, err)
		observability.Default().IncModerationDecision(surface, "degraded_allow")
		return ScreenResult{DegradedFailOpen: true}, nil
	}

	if res.Flagged {
		observability.Default().IncModerationDecision(surface, string(ActionQuarantine))
		s.recordSevereFinding(ctx, surface, p.UserID, p.SubjectID, res.Categories, "omni-moderation-latest")
		return res, nil
	}

	observability.Default().IncModerationDecision(surface, string(ActionAllow))
	return res, nil
}

func hasActiveOpenAIKey(key string) bool {
	return key != "" && key != "sk-mock" && !strings.HasPrefix(key, "sk-...")
}

func (s *Service) callOpenAI(ctx context.Context, text string, mediaURLs []string) (ScreenResult, error) {
	type omniInput struct {
		Type     string            `json:"type"`
		Text     string            `json:"text,omitempty"`
		ImageURL map[string]string `json:"image_url,omitempty"`
	}
	var inputs []omniInput
	if trimmed := strings.TrimSpace(text); trimmed != "" {
		inputs = append(inputs, omniInput{Type: "text", Text: trimmed})
	}
	for _, u := range mediaURLs {
		if strings.TrimSpace(u) != "" {
			inputs = append(inputs, omniInput{Type: "image_url", ImageURL: map[string]string{"url": u}})
		}
	}
	reqBody, err := json.Marshal(map[string]any{
		"model": moderationModel,
		"input": inputs,
	})
	if err != nil {
		return ScreenResult{}, err
	}

	base := strings.TrimSuffix(s.openAIBase, "/")
	if base == "" {
		base = defaultOpenAIBaseURL
	}
	client := s.httpClient
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}

	var out ScreenResult
	var clientErr error
	execErr := s.breaker().Execute(ctx, func(callCtx context.Context) error {
		req, reqErr := http.NewRequestWithContext(callCtx, http.MethodPost, base+"/moderations", bytes.NewReader(reqBody))
		if reqErr != nil {
			clientErr = reqErr
			return nil
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+s.openAIKey)

		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		if readErr != nil {
			return readErr
		}
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			return fmt.Errorf("openai moderation status %d", resp.StatusCode)
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			clientErr = fmt.Errorf("openai moderation status %d: %s", resp.StatusCode, string(raw))
			return nil
		}

		var apiResp struct {
			Results []struct {
				Flagged        bool               `json:"flagged"`
				Categories     map[string]bool    `json:"categories"`
				CategoryScores map[string]float64 `json:"category_scores"`
			} `json:"results"`
		}
		if err := json.Unmarshal(raw, &apiResp); err != nil {
			return err
		}

		catSet := make(map[string]bool)
		for _, r := range apiResp.Results {
			if r.Flagged {
				out.Flagged = true
				for cat, flagged := range r.Categories {
					if flagged {
						catSet[cat] = true
					}
				}
			}
			for _, score := range r.CategoryScores {
				if score > out.HighestScore {
					out.HighestScore = score
				}
			}
		}
		for cat := range catSet {
			out.Categories = append(out.Categories, cat)
		}
		out.IsCSAM = catSet["sexual/minors"]
		out.IsSevereHarm = out.IsCSAM || catSet["hate/threatening"] || catSet["violence/graphic"] || catSet["self-harm/intent"]
		return nil
	})
	if execErr != nil {
		return ScreenResult{}, execErr
	}
	if clientErr != nil {
		return ScreenResult{}, clientErr
	}
	return out, nil
}

func (s *Service) recordSevereFinding(ctx context.Context, surface, userID, subjectID string, categories []string, sourceLabel string) {
	if s.pool == nil {
		return
	}
	if userID != "" {
		abuse.Observe(ctx, s.pool, time.Now(), abuse.Signal{
			Type:        abuse.SignalCoordinatedSpam,
			SubjectType: abuse.SubjectUser,
			SubjectID:   userID,
			Source:      abuse.SourceModerationAI,
			Confidence:  abuse.ConfidenceObserved,
			Retention:   abuse.CoordinatedSignalRetention,
		})
		if _, parseErr := uuid.Parse(userID); parseErr == nil {
			metaJSON, _ := json.Marshal(map[string]any{
				"surface":    surface,
				"subjectId":  subjectID,
				"categories": categories,
				"source":     sourceLabel,
			})
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "SecurityEvent" ("userId", "eventType", metadata)
				VALUES ($1::uuid, 'moderation.flagged', $2)
			`, userID, metaJSON)
		}
	}
}
