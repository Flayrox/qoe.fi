// Package apiaccess — registre modulaire des permissions d'accès API.
//
// Au lieu d'un accès API binaire (approuvé / refusé), chaque créateur reçoit
// un ensemble de « grants » (permissions accordées) choisi par l'admin lors de
// l'approbation de sa demande. Le registre ci-dessous est le catalogue des
// modules accordables :
//
//	api:read / api:write / api:analytics → API entrante (clés API, scopes READ/WRITE/ANALYTICS)
//	webhooks                             → API sortante (webhooks sortants)
//	oauth                                → applications OAuth (fournisseur d'identité)
//
// Le registre est lui-même modulable : l'admin peut désactiver des modules à
// l'échelle de la plateforme via la SystemConfig API_ACCESS_MODULES (JSON,
// liste des modules actuellement accordables). Un module désactivé ne peut ni
// être accordé, ni être utilisé — même si un créateur en possède encore le
// grant (défense en profondeur, sans casser les intégrations existantes).
package apiaccess

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Clés des modules accordables (stables, stockées dans User.apiGrants).
const (
	ModuleAPIRead      = "api:read"
	ModuleAPIWrite     = "api:write"
	ModuleAPIAnalytics = "api:analytics"
	ModuleWebhooks     = "webhooks"
	ModuleOAuth        = "oauth"
)

// Catégories d'affichage (regroupement UI admin / studio).
const (
	CategoryAPI      = "api"
	CategoryWebhooks = "webhooks"
	CategoryOAuth    = "oauth"
)

// ConfigKey est la clé SystemConfig listant les modules actuellement
// accordables à l'échelle de la plateforme (JSON array de clés de module).
const ConfigKey = "API_ACCESS_MODULES"

// AccessDisabledKey est la clé SystemConfig de la coupure générale de l'API
// ("true" = toute l'API refuse les requêtes, sauf console admin / IdP OAuth /
// webhooks entrants infra / événements internes).
const AccessDisabledKey = "API_ACCESS_DISABLED"

// DisabledEndpointsKey est la clé SystemConfig listant les endpoints désactivés
// (JSON array de préfixes de chemins, ex. ["/v1/articles", "/v1/webhooks"]).
const DisabledEndpointsKey = "API_DISABLED_ENDPOINTS"

// rowQuerier est la surface minimale de *pgxpool.Pool nécessaire à la lecture
// de la config (abstraite pour rester mockable dans les services).
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Module décrit une permission accordable.
type Module struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

// Registry est le CATALOGUE des modules d'accès API. Ajouter un module ici le
// rend accordable par les admins et enforceable par les services (après
// avoir branché un point de contrôle).
var Registry = []Module{
	{
		Key:         ModuleAPIRead,
		Label:       "API entrante — lecture",
		Description: "Clés API en lecture (GET) : lire articles, abonnés et statistiques via l'API REST.",
		Category:    CategoryAPI,
	},
	{
		Key:         ModuleAPIWrite,
		Label:       "API entrante — écriture",
		Description: "Clés API en écriture (POST/PUT/DELETE) : publier et modifier du contenu via l'API REST.",
		Category:    CategoryAPI,
	},
	{
		Key:         ModuleAPIAnalytics,
		Label:       "API entrante — analytics",
		Description: "Données analytics (lectures, engagement) via l'API REST.",
		Category:    CategoryAPI,
	},
	{
		Key:         ModuleWebhooks,
		Label:       "API sortante — webhooks",
		Description: "Envoyer des événements (article publié, abonné créé…) vers vos propres serveurs.",
		Category:    CategoryWebhooks,
	},
	{
		Key:         ModuleOAuth,
		Label:       "OAuth / OIDC",
		Description: "Créer des applications OAuth (fournisseur d'identité qoe.fi) pour vos utilisateurs.",
		Category:    CategoryOAuth,
	},
}

// ModuleKeys retourne les clés de tous les modules du registre.
func ModuleKeys() []string {
	keys := make([]string, 0, len(Registry))
	for _, m := range Registry {
		keys = append(keys, m.Key)
	}
	return keys
}

// HasGrant vérifie qu'un grant est présent dans la liste (grants NULL-safe).
func HasGrant(grants []string, key string) bool {
	for _, g := range grants {
		if g == key {
			return true
		}
	}
	return false
}

// AnyGrant vérifie qu'au moins un des grants demandés est présent.
func AnyGrant(grants []string, keys ...string) bool {
	for _, k := range keys {
		if HasGrant(grants, k) {
			return true
		}
	}
	return false
}

// ErrUnknownModule signale une clé de module inconnue du registre.
var ErrUnknownModule = errors.New("module d'accès API inconnu")

// ValidateGrants vérifie que chaque clé est un module connu du registre.
func ValidateGrants(grants []string) error {
	for _, g := range grants {
		if !HasGrant(ModuleKeys(), g) {
			return fmt.Errorf("%w: %s", ErrUnknownModule, g)
		}
	}
	return nil
}

// NormalizeGrants déduplique et trie une liste de grants.
func NormalizeGrants(grants []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(grants))
	for _, g := range grants {
		if seen[g] {
			continue
		}
		seen[g] = true
		out = append(out, g)
	}
	sort.Strings(out)
	return out
}

// ScopesForGrants retourne les scopes de clé API (READ/WRITE/ANALYTICS)
// couverts par les grants API entrante du créateur (moindre privilège).
func ScopesForGrants(grants []string) []string {
	var scopes []string
	if HasGrant(grants, ModuleAPIRead) {
		scopes = append(scopes, "READ")
	}
	if HasGrant(grants, ModuleAPIWrite) {
		scopes = append(scopes, "WRITE")
	}
	if HasGrant(grants, ModuleAPIAnalytics) {
		scopes = append(scopes, "ANALYTICS")
	}
	return scopes
}

// ScopeModule associe un scope de clé API au module qui l'accorde.
func ScopeModule(scope string) string {
	switch scope {
	case "READ":
		return ModuleAPIRead
	case "WRITE":
		return ModuleAPIWrite
	case "ANALYTICS":
		return ModuleAPIAnalytics
	default:
		return ""
	}
}

// LoadEnabled lit la SystemConfig API_ACCESS_MODULES et retourne la liste des
// modules actuellement accordables. Config absente ou invalide → tout le
// registre est accordable (défaut).
func LoadEnabled(ctx context.Context, q rowQuerier) ([]string, error) {
	var raw string
	err := q.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key = $1`, ConfigKey).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ModuleKeys(), nil
		}
		return nil, err
	}
	var keys []string
	if err := json.Unmarshal([]byte(raw), &keys); err != nil || len(keys) == 0 {
		return ModuleKeys(), nil
	}
	// Filtre les clés inconnues (registre = source de vérité).
	known := ModuleKeys()
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		if HasGrant(known, k) && !HasGrant(out, k) {
			out = append(out, k)
		}
	}
	return out, nil
}

// IsEnabled vérifie qu'un module est accordable à l'échelle de la plateforme.
func IsEnabled(ctx context.Context, q rowQuerier, key string) bool {
	enabled, err := LoadEnabled(ctx, q)
	if err != nil {
		return true
	}
	return HasGrant(enabled, key)
}

// AccessControlConfig est l'état de contrôle d'accès global de l'API.
type AccessControlConfig struct {
	// Disabled = coupure générale (API_ACCESS_DISABLED="true").
	Disabled bool `json:"disabled"`
	// DisabledEndpoints = préfixes de chemins d'endpoints désactivés.
	DisabledEndpoints []string `json:"disabledEndpoints"`
}

// LoadAccessControl lit la config de contrôle d'accès de l'API depuis
// SystemConfig. Clés absentes ou invalides → état par défaut (tout ouvert).
func LoadAccessControl(ctx context.Context, q rowQuerier) (AccessControlConfig, error) {
	cfg := AccessControlConfig{}

	var raw string
	err := q.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key = $1`, AccessDisabledKey).Scan(&raw)
	if err == nil {
		cfg.Disabled = strings.EqualFold(strings.TrimSpace(raw), "true")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return cfg, err
	}

	var rawEndpoints string
	err = q.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key = $1`, DisabledEndpointsKey).Scan(&rawEndpoints)
	if err == nil {
		var eps []string
		if jsonErr := json.Unmarshal([]byte(rawEndpoints), &eps); jsonErr == nil {
			for _, e := range eps {
				e = strings.TrimSpace(e)
				if strings.HasPrefix(e, "/") && !HasGrant(cfg.DisabledEndpoints, e) {
					cfg.DisabledEndpoints = append(cfg.DisabledEndpoints, e)
				}
			}
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return cfg, err
	}
	return cfg, nil
}

// EndpointDisabled vérifie si un chemin de requête est couvert par un des
// préfixes d'endpoints désactivés (égalité exacte ou sous-chemin).
func EndpointDisabled(path string, prefixes []string) bool {
	for _, p := range prefixes {
		if path == p || strings.HasPrefix(path, p+"/") {
			return true
		}
	}
	return false
}
