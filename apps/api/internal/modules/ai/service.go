// Package ai — IA de lecture (fiche Plus P1 : résumé fidèle, explication).
// Routes authentifiées + Plus. Quotas mensuels transparents (50/mois/user
// toutes IA confondues + plafond global anti-facture) AVANT l'appel.
// Sans provider → 503 explicite (jamais de faux contenu). Le résumé
// s'affiche TOUJOURS comme IA avec lien au texte original (le front s'en
// charge — le contrat le rappelle dans chaque réponse).
package ai

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/abuse"
	goai "github.com/qoefi/api/internal/ai"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/modules/articles"
	"github.com/qoefi/api/internal/subscriptions"
)

// Service porte les opérations IA (provider injecté, nil = désactivé).
type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
	ac   goai.Provider
}

// NewService construit le service (provider nil = 503 explicite).
func NewService(pool *pgxpool.Pool, ac goai.Provider) *Service {
	if ac == nil {
		ac = goai.NewProvider()
	}
	return &Service{pool: pool, q: db.New(pool), ac: ac}
}

// toUUID convertit un identifiant texte (local — même forme que les
// helpers non exportés des modules, sans dépendre de leurs privates).
func toUUID(id string) pgtype.UUID {
	var u pgtype.UUID
	_ = u.Scan(id)
	return u
}

// textPtrOrNil convertit une chaîne vide en nil (tier optionnel du paywall).
func textPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// Quotas (fiche : quota mensuel transparent + coûts variables encadrés).
const (
	// ActionAIRequest : toute génération IA (résumé + explication confondus).
	ActionAIRequest = "ai.request"
	// MonthlyCapPerUser : 50 générations/mois/utilisateur.
	MonthlyCapPerUser = 50
	// ActionAIGlobal : garde-fou facture (toutes générations).
	ActionAIGlobal = "ai.global"
	// DailyCapGlobal : 10 000 générations/jour sur la plateforme.
	DailyCapGlobal = 10000
)

// ErrAIQuota : quota épuisé → 429 explicite (avec le compteur, pas de
// furtivité : l'utilisateur sait où il en est).
var ErrAIQuota = errors.New("quota IA mensuel épuisé (50/mois)")

// ErrAIGlobalQuota : plafond global atteint → 429 (protection facture).
var ErrAIGlobalQuota = errors.New("capacité IA du moment saturée, réessayez plus tard")

// ErrPlusRequired : IA réservée aux Plus (et Pro via inclusion).
var ErrPlusRequired = errors.New("IA réservée aux abonnés Plus")

// Usage décrit le quota (transparence fiche : l'utilisateur sait où il en est).
type Usage struct {
	Limit     int  `json:"limit"`
	Remaining int  `json:"remaining"`
	Plus      bool `json:"plus"`
}

// checkGate vérifie, dans l'ordre : compte, Plus, quotas (user puis global).
// Retourne l'usage (pour la réponse) ou l'erreur à mapper.
func (s *Service) checkGate(ctx context.Context, userID string) (Usage, error) {
	// userID vide d'abord (sans toucher la base — le seul cas testable pur ;
	// les pointeurs nil wrappés dans une interface ne sont PAS détectés par
	// `pool == nil`, donc on ne s'appuie jamais dessus ici).
	if userID == "" {
		return Usage{Limit: MonthlyCapPerUser}, errors.New("compte requis")
	}
	now := time.Now()
	usage := Usage{Limit: MonthlyCapPerUser, Plus: subscriptions.HasPlus(ctx, s.pool, userID, now)}
	if !usage.Plus {
		return usage, ErrPlusRequired
	}
	month := abuse.MonthlyWindow(now)
	ok, err := abuse.ConsumeBudget(ctx, s.pool, "user_month", userID, ActionAIRequest, month, 1, MonthlyCapPerUser)
	if err != nil {
		return usage, err
	}
	if !ok {
		usage.Remaining = 0
		return usage, ErrAIQuota
	}
	day := abuse.DailyWindow(now)
	ok, err = abuse.ConsumeBudget(ctx, s.pool, "global", "ai", ActionAIGlobal, day, 1, DailyCapGlobal)
	if err != nil {
		return usage, err
	}
	if !ok {
		return usage, ErrAIGlobalQuota
	}
	usage.Remaining = MonthlyCapPerUser - consumed(ctx, s.pool, userID, month)
	if usage.Remaining < 0 {
		usage.Remaining = 0
	}
	return usage, nil
}

// UsageOf lit le quota SANS consommer (transparence avant usage : le front
// affiche « X/50 restants » avant le clic — jamais de surprise au 51e).
// Pool nil (tests purs) : zéros sans toucher la base.
func (s *Service) UsageOf(ctx context.Context, userID string) Usage {
	// Pool nil d'abord (champ concret, la comparaison tient — mais une fois
	// wrappé en interface HasDB, un pointeur nil ne serait plus détecté :
	// ne JAMAIS passer s.pool potentiellement nil à une fonction prenant
	// une interface sans ce garde préalable).
	if s.pool == nil {
		return Usage{Limit: MonthlyCapPerUser, Remaining: MonthlyCapPerUser}
	}
	now := time.Now()
	usage := Usage{Limit: MonthlyCapPerUser, Plus: subscriptions.HasPlus(ctx, s.pool, userID, now)}
	usage.Remaining = MonthlyCapPerUser - consumed(ctx, s.pool, userID, abuse.MonthlyWindow(now))
	if usage.Remaining < 0 {
		usage.Remaining = 0
	}
	return usage
}

// consumed lit le compteur (best-effort : 0 si absent — l'affichage ne gate
// rien, seul ConsumeBudget décide ; le refus a déjà eu lieu si épuisé).
func consumed(ctx context.Context, pool *pgxpool.Pool, userID string, month time.Time) int {
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT "consumed" FROM "CapabilityBudget"
		 WHERE "scopeType" = 'user_month' AND "scopeId" = $1 AND "action" = 'ai.request' AND "window" = $2`,
		userID, month).Scan(&n); err != nil {
		return 0
	}
	return n
}

// Summary est un résumé fidèle (toujours présenté comme IA côté front,
// avec lien au texte original — fiche).
type Summary struct {
	Summary string `json:"summary"`
	Usage   Usage  `json:"usage"`
}

// Summarize résume un article PUBLIC et PUBLIÉ (jamais de brouillon), coupé
// au paywall comme la lecture (pas de résumé au-delà du paywall non acheté).
// Le droit de téléchargement n'est PAS exigé (le résumé s'affiche à
// l'écran, rien n'est mis en cache hors-ligne).
func (s *Service) Summarize(ctx context.Context, userID, articleID, locale string) (Summary, error) {
	now := time.Now()
	usage, err := s.checkGate(ctx, userID)
	if err != nil {
		return Summary{Usage: usage}, err
	}
	var title, content, visibility, tierID, publicationID string
	var published bool
	if err := s.pool.QueryRow(ctx, `
		SELECT title, content, visibility::text, COALESCE("tierId", ''), published, "publicationId"
		FROM "Article" WHERE id = $1`, articleID).Scan(&title, &content, &visibility, &tierID, &published, &publicationID); err != nil {
		return Summary{Usage: usage}, errNotFoundGeneric()
	}
	if !published {
		return Summary{Usage: usage}, errors.New("article non publié")
	}
	// Paywall contenu : MÊME règle que la lecture (entitlements abonné) —
	// jamais de résumé au-delà du paywall non acheté.
	ent := articles.UserEntitlements{}
	sub, err := s.q.GetSubscriberEntitlement(ctx, db.GetSubscriberEntitlementParams{
		PublicationId: publicationID, UserId: toUUID(userID), Email: "",
	})
	if err == nil {
		ent.IsMember = sub.IsActive
		ent.IsPaidSubscriber = sub.IsPremium && sub.IsActive
		if sub.TierId.Valid {
			t := sub.TierId.String
			ent.TierID = &t
		}
	}
	cut := articles.SliceContentAtPaywall(content, ent, visibility, textPtrOrNil(tierID))
	text := stripHTML(cut.Content)
	lang := "fr"
	if strings.HasPrefix(strings.ToLower(locale), "en") {
		lang = "en"
	}
	out, err := s.ac.Generate(ctx, goai.Request{
		System:    summarizeSystem(lang),
		User:      title + "\n\n" + truncateRunes(text, 12000),
		MaxTokens: 500,
	})
	if err != nil {
		// Échec non facturé : le quota a été consommé pour garantir
		// l'atomicité du refus, mais on ne facture jamais un échec
		// (remboursement best-effort — voir RefundBudget).
		abuse.RefundBudget(ctx, s.pool, "user_month", userID, ActionAIRequest, abuse.MonthlyWindow(now), 1)
		usage.Remaining++
		if usage.Remaining > usage.Limit {
			usage.Remaining = usage.Limit
		}
		return Summary{Usage: usage}, err
	}
	return Summary{Summary: strings.TrimSpace(out), Usage: usage}, nil
}

// Explanation est une explication d'extrait (toujours présentée comme IA).
type Explanation struct {
	Explanation string `json:"explanation"`
	Usage       Usage  `json:"usage"`
}

// Explain explique un extrait (1-2000 caractères) : le texte est fourni PAR
// l'utilisateur (il l'a sous les yeux — pas de contrôle paywall possible ni
// nécessaire), borné pour le coût.
func (s *Service) Explain(ctx context.Context, userID, text, locale string) (Explanation, error) {
	// Validation AVANT le gate : une requête invalide ne consomme jamais
	// de quota (seuls les appels provider consommés puis échoués sont
	// remboursés — voir Summarize).
	text = strings.TrimSpace(text)
	if n := len([]rune(text)); n < 1 || n > 2000 {
		return Explanation{}, errors.New("extrait de 1 à 2000 caractères")
	}
	now := time.Now()
	usage, err := s.checkGate(ctx, userID)
	if err != nil {
		return Explanation{Usage: usage}, err
	}
	lang := "fr"
	if strings.HasPrefix(strings.ToLower(locale), "en") {
		lang = "en"
	}
	out, err := s.ac.Generate(ctx, goai.Request{
		System:    explainSystem(lang),
		User:      text,
		MaxTokens: 400,
	})
	if err != nil {
		abuse.RefundBudget(ctx, s.pool, "user_month", userID, ActionAIRequest, abuse.MonthlyWindow(now), 1)
		usage.Remaining++
		if usage.Remaining > usage.Limit {
			usage.Remaining = usage.Limit
		}
		return Explanation{Usage: usage}, err
	}
	return Explanation{Explanation: strings.TrimSpace(out), Usage: usage}, nil
}

func errNotFoundGeneric() error { return errors.New("article introuvable") }

func summarizeSystem(lang string) string {
	if lang == "en" {
		return "Summarize faithfully in a few sentences, without inventing anything. Plain text, no preamble."
	}
	return "Résume fidèlement en quelques phrases, sans rien inventer. Texte brut, sans préambule."
}

func explainSystem(lang string) string {
	if lang == "en" {
		return "Explain this passage simply and faithfully, without inventing anything. Plain text, concise."
	}
	return "Explique ce passage simplement et fidèlement, sans rien inventer. Texte brut, concis."
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// stripHTML retire les balises (le provider reçoit du texte, pas du HTML).
func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		default:
			if !inTag {
				b.WriteRune(r)
			}
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
