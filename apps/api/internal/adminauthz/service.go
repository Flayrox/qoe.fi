package adminauthz

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ErrNoSource dit qu'aucune source de capacités n'est branchée : on ne peut
// rien affirmer, donc rien accorder. Le garde en fait un refus explicite (ou
// une trace, en observation) — jamais un panic au milieu d'une requête.
var ErrNoSource = errors.New("adminauthz: aucune source de capacités branchée")

// DB est la surface SQL nécessaire (un pool pgx la satisfait). Interface
// étroite : le paquet ne peut pas écrire, seulement lire les attributions.
type DB interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// cacheTTL borne la fraîcheur d'une résolution de capacités : retirer un rôle
// prend effet en quelques secondes, sans redéploiement ni invalidation
// distribuée. Var (non const) pour être raccourci dans les tests.
var cacheTTL = 30 * time.Second

// Service résout les capacités d'une personne depuis les tables de rôles, avec
// un cache court. Même forme que flags.Service : un verrou, un horodatage, une
// relecture paresseuse. Il porte aussi la POLITIQUE d'application (observer ou
// refuser) pour que l'interrupteur soit unique dans toute la console.
type Service struct {
	db DB

	modeResolver func(ctx context.Context) bool

	mu    sync.Mutex
	at    map[string]time.Time
	cache map[string]Access
}

func NewService(db DB) *Service {
	return &Service{db: db, at: map[string]time.Time{}, cache: map[string]Access{}}
}

// SetModeResolver branche la décision « refuser ou observer », évaluée par
// requête. Branché au démarrage sur le flag `authz-enforce` : l'interrupteur
// est partagé avec le noyau N0–N3 (internal/authz), donc une seule bascule.
func (s *Service) SetModeResolver(f func(ctx context.Context) bool) { s.modeResolver = f }

// Enforce dit si le refus est réel pour cette requête. Sans resolver branché,
// la réponse est non : observer reste le défaut, une console ne se verrouille
// pas sur une erreur de câblage.
func (s *Service) Enforce(ctx context.Context) bool {
	if s == nil || s.modeResolver == nil {
		return false
	}
	return s.modeResolver(ctx)
}

// SetDB remplace la source de lecture (tests, bascule d'environnement).
func (s *Service) SetDB(db DB) { s.db = db }

// Invalidate oublie l'entrée d'une personne. À appeler quand ses rôles
// changent, pour ne pas attendre le TTL (l'échéance reste, elle, évaluée par
// le SQL à chaque relecture).
func (s *Service) Invalidate(userID string) {
	if userID == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cache, userID)
	delete(s.at, userID)
}

// Access résout les rôles et capacités d'une personne.
//
// Règles :
//   - un identifiant qui n'est pas un UUID ne peut appartenir à personne :
//     retourne un accès vide sans erreur (le garde refuse, sans 500) ;
//   - `User."role" = 'superadmin'` vaut TOUTES les capacités — la promotion
//     historique reste souveraine, aucun superadmin existant ne peut être
//     verrouillé par l'introduction des rôles ;
//   - une capacité présente en base mais absente du vocabulaire Go est
//     ignorée : un droit inconnu n'accorde rien (refus par défaut).
func (s *Service) Access(ctx context.Context, userID string) (Access, error) {
	if s == nil || s.db == nil {
		// Erreur explicite plutôt qu'un panic : le garde sait quoi en faire
		// (refus en mode refus, trace en observation), et la garde
		// superadmin des services reste la défense en profondeur.
		return Access{}, ErrNoSource
	}
	if userID == "" {
		return Access{}, nil
	}
	var uid pgtype.UUID
	if err := uid.Scan(userID); err != nil || !uid.Valid {
		return Access{}, nil
	}

	s.mu.Lock()
	if at, ok := s.at[userID]; ok && time.Since(at) < cacheTTL {
		cached := cloneAccess(s.cache[userID])
		s.mu.Unlock()
		return cached, nil
	}
	s.mu.Unlock()

	// Relecture hors verrou : une requête lente ne doit pas sérialiser la
	// console entière. Deux requêtes concurrentes pour la même personne
	// peuvent se croiser — la seconde écrase sa propre lecture, sans effet.
	access, err := s.load(ctx, userID, uid)
	if err != nil {
		return Access{}, err
	}

	s.mu.Lock()
	s.cache[userID] = access
	s.at[userID] = time.Now()
	s.mu.Unlock()
	return cloneAccess(access), nil
}

const rolesQuery = `
	SELECT t."role"
	FROM (
		SELECT ur."roleKey" AS "role"
		  FROM "AdminUserRole" ur
		 WHERE ur."userId" = $1
		   AND (ur."expiresAt" IS NULL OR ur."expiresAt" > CURRENT_TIMESTAMP)
		UNION ALL
		SELECT 'superadmin' AS "role"
		  FROM "User" u
		 WHERE u."id" = $1 AND u."role" = 'superadmin'
	) t`

const capabilitiesQuery = `
	SELECT DISTINCT rc."capabilityKey"
	  FROM "AdminUserRole" ur
	  JOIN "AdminRoleCapability" rc ON rc."roleKey" = ur."roleKey"
	 WHERE ur."userId" = $1
	   AND (ur."expiresAt" IS NULL OR ur."expiresAt" > CURRENT_TIMESTAMP)`

// load lit les rôles puis les capacités. Le legacy superadmin est détecté par
// la présence du rôle dans le premier résultat (la requête des rôles le
// fabrique), donc une seule requête porte la règle de non-verrouillage.
func (s *Service) load(ctx context.Context, userID string, uid pgtype.UUID) (Access, error) {
	roles, legacySuperadmin, err := s.loadRoles(ctx, uid)
	if err != nil {
		return Access{}, err
	}

	caps := Set{}
	if legacySuperadmin {
		caps = AllCapabilities()
	}

	rows, err := s.db.Query(ctx, capabilitiesQuery, uid)
	if err != nil {
		return Access{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return Access{}, err
		}
		c := Capability(key)
		if !c.Valid() {
			// Vocabulaire Go = source de vérité : une clé inconnue en base
			// n'accorde rien (le test de parité la rattrape en CI).
			continue
		}
		caps[c] = true
	}
	if err := rows.Err(); err != nil {
		return Access{}, err
	}

	return Access{UserID: userID, Roles: roles, Capabilities: caps}, nil
}

// loadRoles relit les rôles, en signalant la promotion historique superadmin.
func (s *Service) loadRoles(ctx context.Context, uid pgtype.UUID) ([]string, bool, error) {
	rows, err := s.db.Query(ctx, rolesQuery, uid)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	roles := []string{}
	seen := map[string]bool{}
	legacySuperadmin := false
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, false, err
		}
		if role == RoleSuperadmin {
			legacySuperadmin = true
		}
		if seen[role] {
			continue
		}
		seen[role] = true
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	return roles, legacySuperadmin, nil
}

// cloneAccess délie l'accès rendu du cache : l'ensemble de capacités est une
// map, donc partager la référence permettrait à un appelant de modifier le
// cache d'autorisation. Les copies sont volontairement non nil.
func cloneAccess(a Access) Access {
	out := Access{UserID: a.UserID}
	out.Roles = make([]string, 0, len(a.Roles))
	out.Roles = append(out.Roles, a.Roles...)
	out.Capabilities = Set{}
	for c, on := range a.Capabilities {
		if on {
			out.Capabilities[c] = true
		}
	}
	return out
}
