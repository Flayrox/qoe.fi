package adminauthz

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
)

// Mode dit si un refus est réellement produit ou seulement journalisé.
type Mode int

const (
	// ModeObserve journalise le refus mais laisse passer. Défaut : on câble
	// largement, on mesure, puis on bascule — sans jamais verrouiller une
	// console existante le jour du déploiement.
	ModeObserve Mode = iota
	// ModeEnforce refuse réellement (403 + code).
	ModeEnforce
)

func (m Mode) String() string {
	if m == ModeEnforce {
		return "enforce"
	}
	return "observe"
}

// Decision est la trace d'un passage dans le garde (supervision, audit). Elle
// porte assez de contexte pour être écrite telle quelle dans le journal des
// décisions (migration 00057) : route visée, mode, code, adresse.
type Decision struct {
	Capability Capability
	// Allowed dit si la capacité a été prouvée.
	Allowed bool
	// Code porte le motif (authz.CodeAllow quand la capacité est détenue).
	Code authz.Code
	// Mode est le mode effectif au moment de la décision.
	Mode Mode
	// ProofLevel est le niveau de preuve exigé (N0–N3), vide si aucun.
	ProofLevel string
	// Method et Path : la route visée, pour recouper avec les journaux HTTP.
	Method string
	Path   string
	// IP et RequestID : de quoi recouper une décision avec une requête.
	IP        string
	RequestID string
}

// Lookup résout l'accès d'une personne. Un *Service le satisfait ; les tests
// fournissent une implémentation en mémoire.
type Lookup interface {
	Access(ctx context.Context, userID string) (Access, error)
}

// ModeResolver est implémenté par un Lookup qui porte lui-même la politique
// d'application (le *Service le fait, branché sur le flag `authz-enforce`).
// Un seul interrupteur pour toute la console, jamais un par route.
type ModeResolver interface {
	Enforce(ctx context.Context) bool
}

// Observer est appelé pour chaque décision, y compris en mode observation :
// à brancher sur les métriques pour suivre la bascule.
type Observer func(d Decision, userID string)

type guard struct {
	lookup     Lookup
	capability Capability
	mode       Mode
	modeFn     func(ctx context.Context) bool
	observer   Observer
	// proofLevel : niveau de preuve exigé par la route, EN PLUS de la
	// capacité (Phase 3, step-up). Défaut N0 — l'authentification de base
	// suffit — et chaque route monte le niveau qu'elle assume : le niveau est
	// déclaré, jamais déduit du nom de la capacité.
	proofLevel authz.Level
	// approval : seconde validation d'un acte N3 (quorum, Phase 8). Un N3 sans
	// mécanisme d'approbation branché est refusé — une double validation qu'on
	// ne sait pas vérifier n'est pas une double validation.
	approval ApprovalCheck
	// approvalAct : l'action du noyau que la route exécute, celle qu'une seconde
	// personne doit avoir approuvée. Sans elle, une approbation donnée pour un
	// acte validerait n'importe quel autre : jamais de quorum implicite.
	approvalAct authz.Action
	// approvalTarget : nom du paramètre d'URL qui désigne la cible de l'acte
	// (`versionID` pour une publication juridique). Vide = acte sans cible
	// (approbation globale pour l'acte).
	approvalTarget string
	// now : horloge injectable (tests de fraîcheur) ; nil = horloge système.
	now func() time.Time
}

// Option configure le garde.
type Option func(*guard)

// WithMode fige le mode pour ce garde (prioritaire sur le resolver porté par
// le Lookup, sauf WithModeResolver qui reste prioritaire).
func WithMode(m Mode) Option { return func(g *guard) { g.mode = m } }

// WithModeResolver décide du mode par requête pour ce garde précis.
func WithModeResolver(f func(ctx context.Context) bool) Option {
	return func(g *guard) { g.modeFn = f }
}

// WithObserver branche la supervision des décisions.
func WithObserver(o Observer) Option { return func(g *guard) { g.observer = o } }

// WithProofLevel déclare le niveau de preuve exigé par la route. Le contrôle
// lui-même vit dans le noyau N0–N3 (authz.VerifyLevel) : ce paquet ne
// réinvente pas la preuve, il la NOMME dans le journal et la fait respecter.
//
// Une route N2 n'accepte donc pas une session `aal2` ouverte le matin : il faut
// un facteur fort (TOTP/passkey) utilisé il y a moins de 10 minutes, ce que le
// client obtient par un step-up puis en rejouant l'action.
func WithProofLevel(level authz.Level) Option { return func(g *guard) { g.proofLevel = level } }

// WithApproval branche la vérification de la double validation (N3).
func WithApproval(fn ApprovalCheck) Option { return func(g *guard) { g.approval = fn } }

// WithApprovalAct nomme l'action du noyau (authz.Action) que la route exécute :
// c'est CETTE action qu'une seconde personne doit avoir approuvée, jamais un
// droit générique. Obligatoire sur une route N3.
func WithApprovalAct(act authz.Action) Option { return func(g *guard) { g.approvalAct = act } }

// WithApprovalTargetParam nomme le paramètre d'URL qui porte la cible de l'acte
// (`versionID`, `importID`…). L'approbation est alors liée à cette cible
// précise. Sur une route N3 qui déclare ce paramètre, une requête sans cible
// est refusée : on ne valide pas « quelque chose ».
func WithApprovalTargetParam(param string) Option {
	return func(g *guard) { g.approvalTarget = param }
}

// WithClock remplace l'horloge du garde (fraîcheur de preuve, tests).
func WithClock(now func() time.Time) Option { return func(g *guard) { g.now = now } }

// requestIP lit l'adresse du client derrière un proxy (X-Forwarded-For posé par
// le reverse proxy, puis X-Real-IP) et retombe sur l'adresse de connexion.
// Jamais inventée : vide si rien n'est lisible.
func requestIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if first := strings.TrimSpace(strings.Split(forwarded, ",")[0]); first != "" {
			return first
		}
	}
	if real := strings.TrimSpace(r.Header.Get("X-Real-IP")); real != "" {
		return real
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// resolveMode rend le mode effectif : resolver du garde, puis résolver porté
// par le Lookup (le flag de la console), puis mode statique du garde.
func (g *guard) resolveMode(ctx context.Context) Mode {
	if g.modeFn != nil {
		if g.modeFn(ctx) {
			return ModeEnforce
		}
		return ModeObserve
	}
	if r, ok := g.lookup.(ModeResolver); ok && r != nil {
		if r.Enforce(ctx) {
			return ModeEnforce
		}
		return ModeObserve
	}
	return g.mode
}

// observe transmet la décision à l'observateur branché, s'il y en a un.
func (g *guard) observe(d Decision, userID string, mode Mode) {
	if g.observer == nil {
		return
	}
	d.Mode = mode
	g.observer(d, userID)
}

// trace construit la décision d'une requête : capacité exigée, route, adresse.
// Le mode est posé par observe (il dépend du moment de la décision).
func (g *guard) trace(r *http.Request, code authz.Code, allowed bool) Decision {
	return Decision{
		Capability: g.capability,
		Allowed:    allowed,
		Code:       code,
		ProofLevel: g.proofLevel.String(),
		Method:     r.Method,
		Path:       r.URL.Path,
		IP:         requestIP(r),
		RequestID:  r.Header.Get("X-Request-Id"),
	}
}

// checkProof confronte la SESSION à la preuve exigée par la route. Il ne fait
// rien pour une route N0 : c'est le cas de la quasi-totalité de la console.
//
// La session est reconstruite depuis les claims JWT à CHAQUE requête : rien
// n'est lu d'un en-tête client, et un `aal2` annoncé par SMS ne compte pas plus
// qu'ailleurs (même noyau que les actions média).
func (g *guard) checkProof(r *http.Request, userID string) (authz.Code, string, bool) {
	if !g.proofLevel.RequiresStrongAuth() {
		return authz.CodeAllow, "", true
	}
	now := time.Now()
	if g.now != nil {
		now = g.now()
	}
	session := authz.FromClaims(middleware.Claims(r.Context()))
	code, reason := authz.VerifyLevel(session, g.proofLevel, now)
	if code != authz.CodeAllow {
		return code, reason, false
	}
	if g.proofLevel == authz.Level3 {
		if g.approval == nil || g.approvalAct == "" {
			return authz.CodeNeedsReview, "double validation exigée : aucune approbation ne peut être vérifiée", false
		}
		target := ""
		if g.approvalTarget != "" {
			target = chi.URLParam(r, g.approvalTarget)
			if target == "" {
				return authz.CodeNeedsReview, "cible de l'acte indéterminée : double validation impossible", false
			}
		}
		if !g.approval(r.Context(), userID, g.approvalAct, target) {
			return authz.CodeNeedsReview, "double validation requise : une seconde personne autorisée doit approuver cette demande", false
		}
	}
	return authz.CodeAllow, "", true
}

// Require monte le garde de capacité sur une route.
//
// Le refus est le défaut : une route qui exige une capacité et dont la preuve
// est absente est refusée — l'absence de preuve n'est pas une autorisation.
// Deux garde-fous volontaires :
//
//   - un Lookup nil (service non branché) ne refuse JAMAIS. Une console ne se
//     verrouille pas sur une erreur de câblage : elle retombe sur la garde
//     superadmin des services, qui reste en place (défense en profondeur), et
//     le garde le journalise à chaque requête ;
//   - la session absente est toujours refusée (401), quel que soit le mode :
//     il n'y a rien à observer quand aucune identité n'existe, et la garde
//     d'authentification en amont garantit qu'un admin en a toujours une. Un
//     admin légitime ne peut donc pas être bloqué par cette branche.
//
// Le mode par défaut est l'observation ; il suit le flag `authz-enforce` porté
// par le service (voir ModeResolver), donc la bascule est unique pour toute la
// console et réversible sans redéploiement.
func Require(lookup Lookup, capability Capability, opts ...Option) func(http.Handler) http.Handler {
	g := &guard{lookup: lookup, capability: capability, mode: ModeObserve}
	for _, o := range opts {
		o(g)
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, _ := middleware.UserID(r.Context())
			if userID == "" {
				// Ni capacité ni identité : rien à observer, refus immédiat.
				g.observe(g.trace(r, authz.CodeDenyNoSession, false), "", ModeEnforce)
				writeDenied(w, http.StatusUnauthorized, capability,
					authz.CodeDenyNoSession, "Authentification requise.", "")
				return
			}

			mode := g.resolveMode(r.Context())

			if g.lookup == nil {
				// Sans service de capacités, le garde n'affirme rien — ni sur
				// le droit, ni sur la preuve : exiger un step-up alors qu'on ne
				// sait pas vérifier le droit serait incohérent. La garde
				// superadmin des services reste active (défense en profondeur).
				log.Printf("[adminauthz] service de capacités non branché : %s non vérifiée (%s %s)",
					capability, r.Method, r.URL.Path)
				g.observe(g.trace(r, authz.CodeDenyCapabilityLookup, false), userID, mode)
				next.ServeHTTP(w, r)
				return
			}

			access, err := g.lookup.Access(r.Context(), userID)
			if err != nil {
				// Erreur de résolution : on ne peut rien affirmer. En mode
				// refus, on refuse (un droit non prouvé n'est pas accordé) ;
				// en observation, on trace et on laisse passer.
				log.Printf("[adminauthz] capacités indisponibles (user=%s, capacité=%s) : %v",
					userID, capability, err)
				g.observe(g.trace(r, authz.CodeDenyCapabilityLookup, false), userID, mode)
				if mode == ModeEnforce {
					writeDenied(w, http.StatusForbidden, capability,
						authz.CodeDenyCapabilityLookup, "Vérification des droits indisponible.", "")
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			if access.Has(capability) {
				// Le droit est établi ; reste à vérifier la preuve. Le droit
				// d'abord : on n'invite pas à un step-up coûteux pour un acte
				// qu'on n'a de toute façon pas le droit d'expédier.
				code, reason, ok := g.checkProof(r, userID)
				if ok {
					g.observe(g.trace(r, authz.CodeAllow, true), userID, mode)
					next.ServeHTTP(w, r)
					return
				}
				// Le quorum N3 n'est jamais « observé ». Une preuve ancienne (N2) est
				// un risque gradué qu'on peut mesurer avant d'armer le refus ; un acte
				// irréversible sans sa seconde validation n'est pas un faux positif —
				// c'est l'absence du contrôle. N3 refuse donc dans les deux modes :
				// l'observation aurait ouvert la publication juridique à quiconque
				// détient la capacité, tant que le flag reste éteint.
				if mode == ModeObserve && g.proofLevel < authz.Level3 {
					log.Printf("[adminauthz:observe] %s %s : preuve insuffisante (user=%s, niveau=%s, code=%s) — step-up à proposer",
						r.Method, r.URL.Path, userID, g.proofLevel, code)
					g.observe(g.trace(r, code, false), userID, mode)
					next.ServeHTTP(w, r)
					return
				}
				log.Printf("[adminauthz:deny] %s %s (user=%s, niveau=%s, code=%s)",
					r.Method, r.URL.Path, userID, g.proofLevel, code)
				// ModeEnforce : ce refus est APPLIQUÉ, y compris le quorum N3 en
				// observation. La trace ne doit pas laisser croire à un simple
				// avertissement (le journal distingue « appliqué » d'« observé »).
				g.observe(g.trace(r, code, false), userID, ModeEnforce)
				writeDenied(w, http.StatusForbidden, capability, code, reason, g.proofLevel.String())
				return
			}

			// Aucune capacité du tout : ce n'est pas un membre de la console.
			// Ce refus ne dépend PAS du mode : l'observation sert à ne pas
			// verrouiller un personnel légitime pendant la bascule — jamais à
			// ouvrir le journal d'audit, la configuration ou les dossiers de
			// comptes à quiconque possède un jeton Supabase. Un superadmin (ou
			// tout rôle attribué) détient toujours au moins une capacité : ce
			// refus ne peut pas atteindre quelqu'un qui a sa place ici.
			//
			// Seule exception : GET /v1/admin/me, qui sert à répondre « voici ce
			// que vous détenez » — y compris « rien ». C'est cette réponse vide
			// que l'interface transforme en refus explicable ; la refuser ferait
			// croire à une panne au lieu d'un accès absent.
			if !access.IsStaff() && capability != SelfRead {
				log.Printf("[adminauthz:deny] %s %s : compte sans rôle staff (user=%s, capacité=%s)",
					r.Method, r.URL.Path, userID, capability)
				g.observe(g.trace(r, authz.CodeDenyMissingCapability, false), userID, ModeEnforce)
				writeDenied(w, http.StatusForbidden, capability,
					authz.CodeDenyMissingCapability, "Accès à la console d'administration requis.", g.proofLevel.String())
				return
			}

			if mode == ModeObserve {
				log.Printf("[adminauthz:observe] %s %s refusé (user=%s, capacité=%s, rôles=%v)",
					r.Method, r.URL.Path, userID, capability, access.Roles)
				g.observe(g.trace(r, authz.CodeDenyMissingCapability, false), userID, mode)
				next.ServeHTTP(w, r)
				return
			}

			log.Printf("[adminauthz:deny] %s %s (user=%s, capacité=%s, rôles=%v)",
				r.Method, r.URL.Path, userID, capability, access.Roles)
			g.observe(g.trace(r, authz.CodeDenyMissingCapability, false), userID, mode)
			writeDenied(w, http.StatusForbidden, capability,
				authz.CodeDenyMissingCapability, "Capacité requise absente.", g.proofLevel.String())
		})
	}
}

// writeDenied répond avec un code exploitable par le client : `goFetch`
// transporte `body.code` jusqu'à l'interface, qui peut alors expliquer le
// refus (« il vous manque telle capacité », « votre preuve est trop ancienne »)
// au lieu d'un « accès refusé » muet. L'en-tête X-Qoe-Authz-Code porte le même
// code pour les proxys qui réécriraient le corps ; `level` dit la preuve
// exigée, ce qui distingue un step-up d'un refus de droit.
func writeDenied(w http.ResponseWriter, status int, capability Capability, code authz.Code, reason, level string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Qoe-Authz-Code", string(code))
	w.WriteHeader(status)
	body := map[string]any{
		"error":      reason,
		"code":       string(code),
		"capability": string(capability),
	}
	if level != "" {
		body["level"] = level
	}
	_ = json.NewEncoder(w).Encode(body)
}
