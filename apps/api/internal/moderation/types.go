// Package moderation unifie la modération de contenu côté serveur (fast-path
// synchrone < 1 ms + dépistage asynchrone OpenAI omni-moderation-latest).
package moderation

import "github.com/qoefi/api/internal/trust"

// Surfaces modérées par l'entonnoir.
const (
	SurfacePost       = "post"
	SurfaceArticle    = "article"
	SurfaceComment    = "comment"
	SurfaceDM         = "dm"
	SurfaceUserReport = "user_report"
)

// Verdict d'action retourné par CheckSync / ScreenAsync.
type Action string

const (
	ActionAllow      Action = "allow"
	ActionFlag       Action = "flag"
	ActionQuarantine Action = "quarantine"
	ActionBlock      Action = "block"
)

// CheckInput décrit le contenu soumis à la modération synchrone.
type CheckInput struct {
	Surface   string
	SubjectID string
	UserID    string
	Text      string
	TrustTier trust.Tier
	MediaURLs []string
}

// Verdict rassemble la décision fast-path et l'éventuel besoin de revue IA asynchrone.
type Verdict struct {
	Action      Action
	ReasonCode  string
	Reason      string
	AsyncScreen bool
	Flags       map[string]bool
}

// Blocked retourne true lorsque le contenu doit être rejeté immédiatement en HTTP.
func (v Verdict) Blocked() bool {
	return v.Action == ActionBlock
}
