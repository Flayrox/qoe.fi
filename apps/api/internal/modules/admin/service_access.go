package admin

// =====================================================================
// 🚪 Accès staff — attribuer un rôle sans SQL (plan console, Phase 2)
// =====================================================================
// La console savait décrire les rôles (00053 : capacités, rôles, matrice,
// attributions datées) mais pas les ATTRIBUER : nommer un modérateur demandait
// un INSERT à la main dans "AdminUserRole". Ce fichier ouvre la seule surface
// qui manquait, sous la capacité `admin.access.grant`.
//
// Doctrine, alignée sur le reste de la console :
//   - l'autorité est la CAPACITÉ (garde de route), pas un test de rôle enfoui :
//     un rôle détenant `admin.access.grant` peut attribuer, même s'il n'est pas
//     superadmin ;
//   - pas d'escalade : on ne distribue que des capacités qu'on détient
//     soi-même, et on ne retire que des capacités qu'on détient soi-même. Un
//     délégataire ne peut donc ni se promouvoir, ni déclasser son délégant ;
//   - on ne se coupe jamais la main : retirer son propre DERNIER rôle actif est
//     refusé (sauf promotion historique superadmin, qui garde tout) ;
//   - on ne coupe jamais la plateforme : révoquer le DERNIER superadmin est
//     refusé, sauf s'il conserve la promotion historique `User."role"` ;
//   - MOTIF obligatoire pour attribuer comme pour révoquer, et la trace est
//     écrite SYSTÉMATIQUEMENT — l'audit d'un mouvement de droits ne dépend pas
//     du flag `admin-audit-log` (une trace optionnelle n'est pas une trace).
//
// SQL à la main (comme placements) : le modèle dépasse ce que sqlc génère pour
// ces tables, et la doctrine d'accès bouge trop pour figer un schéma généré.
// Toutes les écritures passent par une transaction : les compteurs de
// garde-fou et l'écriture voient le même état.
// =====================================================================

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/adminauthz"
)

// errInvalidAccess : saisie d'accès refusée par une règle métier (motif
// absent, escalade, dernier rôle). Sentinel pour que le handler réponde 400 —
// une saisie fautive n'est pas une panne serveur.
var errInvalidAccess = errors.New("accès staff invalide")

// motifMinLength borne la qualité du motif : « ok » n'explique rien, et une
// attribution de droits non expliquée est exactement ce qu'on cherche à
// supprimer en passant par la console.
const motifMinLength = 5

// AccessGrant est une attribution de rôle telle qu'affichée et rendue :
// la ligne "AdminUserRole" jointe à la personne et au libellé du rôle.
type AccessGrant struct {
	UserID       string  `json:"userId"`
	Email        string  `json:"email"`
	Name         *string `json:"name"`
	Username     *string `json:"username"`
	RoleKey      string  `json:"roleKey"`
	RoleLabel    string  `json:"roleLabel"`
	RoleIsSystem bool    `json:"roleIsSystem"`
	// GrantedBy : qui a accordé le rôle (nil = backfill système / promotion
	// historique). Jamais l'e-mail : la console le résout à l'affichage.
	GrantedBy *string `json:"grantedBy"`
	GrantedAt string  `json:"grantedAt"`
	ExpiresAt *string `json:"expiresAt"`
	// State : "active" | "expired". Une attribution échue n'accorde plus rien
	// (l'échéance est une condition de lecture, pas une purge).
	State string `json:"state"`
}

// AccessPerson est la réponse à « pourquoi cette personne détient-elle ceci ? » :
// ses attributions (échéances incluses), ses capacités EFFECTIVES et la
// provenance de chacune. Rien n'est deviné côté interface.
type AccessPerson struct {
	UserID   string  `json:"userId"`
	Email    string  `json:"email"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	// LegacySuperadmin : `User."role" = 'superadmin'` — la promotion historique,
	// qui vaut toutes les capacités et ne peut pas être verrouillée.
	LegacySuperadmin bool          `json:"legacySuperadmin"`
	Roles            []AccessGrant `json:"roles"`
	// Capabilities : capacités effectives (échéances appliquées, vocabulaire Go
	// seul). Toujours non nil : une liste null ferait tomber l'interface.
	Capabilities []string `json:"capabilities"`
	// CapabilitySources explique chaque capacité : rôle(s) qui la porte, ou
	// « promotion historique superadmin ».
	CapabilitySources map[string][]string `json:"capabilitySources"`
}

// AccessRole est une ligne de la matrice rôle × capacité, telle que la BASE la
// porte (jamais telle que l'interface l'imagine) : libellé, description,
// capacités et nombre de personnes qui le détiennent aujourd'hui.
type AccessRole struct {
	Key          string   `json:"key"`
	Label        string   `json:"label"`
	Description  string   `json:"description"`
	IsSystem     bool     `json:"isSystem"`
	Capabilities []string `json:"capabilities"`
	Holders      int64    `json:"holders"`
}

// AccessPersonSummary est une personne CANDIDATE à une attribution : de quoi
// choisir sans recopier un identifiant à la main. La recherche exige un motif
// d'au moins deux caractères : lister toute la base des comptes depuis la
// console d'accès serait une énumération, pas une recherche.
type AccessPersonSummary struct {
	UserID   string  `json:"userId"`
	Email    string  `json:"email"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	// Roles : rôles ACTIFS (échéances appliquées), triés, toujours non nil.
	Roles []string `json:"roles"`
	// LegacySuperadmin : la promotion historique, qui détient déjà tout.
	LegacySuperadmin bool `json:"legacySuperadmin"`
}

// AccessCapability décrit une capacité du vocabulaire semé en base.
type AccessCapability struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Domain      string `json:"domain"`
	Description string `json:"description"`
}

// GrantAccessInput porte une attribution : qui, quel rôle, jusqu'à quand, et
// pourquoi. L'échéance est optionnelle (NULL = sans fin).
type GrantAccessInput struct {
	UserID    string `json:"userId"`
	RoleKey   string `json:"roleKey"`
	ExpiresAt string `json:"expiresAt"`
	Reason    string `json:"reason"`
}

// accessGrantsQuery liste les attributions. $1 = motif de recherche (texte
// libre), $2 = même motif en LIKE, $3 = limite, $4 = identifiant exact
// (UUID ou NULL — un motif qui n'est pas un UUID ne doit pas faire échouer un
// cast, donc l'UUID voyage dans son propre paramètre nullable).
const accessGrantsQuery = `
	SELECT ur."userId", u."email", u."name", u."username",
	       ur."roleKey", r."label", r."isSystem",
	       ur."grantedBy", ur."grantedAt", ur."expiresAt",
	       (ur."expiresAt" IS NOT NULL AND ur."expiresAt" <= CURRENT_TIMESTAMP) AS expired
	  FROM "AdminUserRole" ur
	  JOIN "User" u ON u."id" = ur."userId"
	  JOIN "AdminRole" r ON r."key" = ur."roleKey"
	 WHERE ($1::text = '' OR u."email" ILIKE $2
	        OR COALESCE(u."username", '') ILIKE $2
	        OR COALESCE(u."name", '') ILIKE $2
	        OR ur."roleKey" ILIKE $2
	        OR r."label" ILIKE $2)
	   AND ($4::uuid IS NULL OR ur."userId" = $4::uuid)
	 ORDER BY u."email" ASC, ur."roleKey" ASC
	 LIMIT $3`

const accessPersonLegacyQuery = `SELECT COALESCE(u."role", '') FROM "User" u WHERE u."id" = $1::uuid`

const accessPersonCapabilitiesQuery = `
	SELECT DISTINCT rc."capabilityKey", ur."roleKey"
	  FROM "AdminUserRole" ur
	  JOIN "AdminRoleCapability" rc ON rc."roleKey" = ur."roleKey"
	 WHERE ur."userId" = $1::uuid
	   AND (ur."expiresAt" IS NULL OR ur."expiresAt" > CURRENT_TIMESTAMP)`

const accessActiveRolesQuery = `
	SELECT COUNT(*) FROM "AdminUserRole"
	 WHERE "userId" = $1::uuid
	   AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)`

// accessActiveRoleHoldersQuery compte les détenteurs ACTIFS du rôle qui n'ont
// PAS la promotion historique superadmin : ce sont ceux dont la révocation
// retire réellement quelque chose. Un détenteur legacy garde tout de toute
// façon — le compter ferait croire à une sécurité qui n'existe pas.
const accessActiveRoleHoldersQuery = `
	SELECT COUNT(*) FROM "AdminUserRole" ur
	  JOIN "User" u ON u."id" = ur."userId"
	 WHERE ur."roleKey" = $1
	   AND (ur."expiresAt" IS NULL OR ur."expiresAt" > CURRENT_TIMESTAMP)
	   AND u."role" <> 'superadmin'`

const accessUserExistsQuery = `SELECT 1 FROM "User" WHERE "id" = $1::uuid`

const accessUpsertGrantQuery = `
	INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedBy", "grantedAt", "expiresAt")
	VALUES ($1::uuid, $2, $3::uuid, CURRENT_TIMESTAMP, $4)
	ON CONFLICT ("userId", "roleKey") DO UPDATE
	   SET "grantedBy" = EXCLUDED."grantedBy",
	       "grantedAt" = EXCLUDED."grantedAt",
	       "expiresAt" = EXCLUDED."expiresAt"`

const accessDeleteGrantQuery = `
	DELETE FROM "AdminUserRole" WHERE "userId" = $1::uuid AND "roleKey" = $2`

const accessRolesQuery = `
	SELECT r."key", r."label", r."description", r."isSystem",
	       COALESCE(rc."capabilityKey", '')
	  FROM "AdminRole" r
	  LEFT JOIN "AdminRoleCapability" rc ON rc."roleKey" = r."key"
	 ORDER BY r."key" ASC, rc."capabilityKey" ASC`

// accessPeopleQuery cherche des personnes par email, pseudonyme ou nom.
// $1 = motif brut (garde-fou de longueur côté Go), $2 = motif LIKE, $3 = limite.
const accessPeopleQuery = `
	SELECT u."id", u."email", u."name", u."username",
	       COALESCE(
	           array_agg(DISTINCT ur."roleKey") FILTER (
	               WHERE ur."roleKey" IS NOT NULL
	                 AND (ur."expiresAt" IS NULL OR ur."expiresAt" > CURRENT_TIMESTAMP)
	           ), '{}'
	       ) AS roles,
	       (u."role" = 'superadmin') AS legacy_superadmin
	  FROM "User" u
	  LEFT JOIN "AdminUserRole" ur ON ur."userId" = u."id"
	 WHERE ($1::text <> '' AND (
	           u."email" ILIKE $2
	        OR COALESCE(u."username", '') ILIKE $2
	        OR COALESCE(u."name", '') ILIKE $2))
	 GROUP BY u."id", u."email", u."name", u."username", u."role"
	 ORDER BY u."email" ASC
	 LIMIT $3`

const accessCapabilitiesQuery = `
	SELECT "key", "label", "domain", "description"
	  FROM "AdminCapability"
	 ORDER BY "domain" ASC, "key" ASC`

// requirePool refuse explicitement quand le service n'a pas de base : une
// console sans base ne peut ni lire ni écrire un accès, et un nil déréférencé
// au milieu d'une requête serait un panic, pas un refus.
func (s *Service) requirePool() (*pgxpool.Pool, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("accès staff indisponible : base non branchée")
	}
	return s.pool, nil
}

// motifValidé borne et normalise le motif : obligatoire, non trivial.
func motifValidé(reason string) (string, error) {
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) < motifMinLength {
		return "", fmt.Errorf("%w : un motif d'au moins %d caractères est requis", errInvalidAccess, motifMinLength)
	}
	return reason, nil
}

// parseAccessExpiry lit une échéance RFC3339 ou AAAA-MM-JJ. Chaîne vide → NULL
// (sans fin). Une échéance passée est refusée : attribuer un rôle déjà échu
// n'est pas une attribution, c'est une erreur de saisie silencieuse.
func parseAccessExpiry(raw string) (pgtype.Timestamp, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return pgtype.Timestamp{}, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		t, err = time.Parse("2006-01-02", raw)
		if err != nil {
			return pgtype.Timestamp{}, fmt.Errorf("%w : échéance illisible (RFC3339 ou AAAA-MM-JJ attendu)", errInvalidAccess)
		}
		// Une date simple couvre la journée entière : nommer quelqu'un « jusqu'au
		// 31/12 » doit valoir jusqu'à la fin du 31, pas jusqu'à minuit.
		t = t.Add(24*time.Hour - time.Second)
	}
	if !t.After(time.Now()) {
		return pgtype.Timestamp{}, fmt.Errorf("%w : l'échéance doit être future", errInvalidAccess)
	}
	return pgtype.Timestamp{Time: t.UTC(), Valid: true}, nil
}

// optionalUUID convertit un identifiant texte en UUID nullable : un motif de
// recherche qui n'est pas un UUID part en NULL (le SQL ne le caste jamais).
func optionalUUID(raw string) pgtype.UUID {
	var uid pgtype.UUID
	if err := uid.Scan(strings.TrimSpace(raw)); err != nil {
		return pgtype.UUID{}
	}
	return uid
}

// ListAccessGrants liste les attributions, filtrables par email, nom,
// pseudonyme, rôle ou identifiant exact. Lecture seule.
func (s *Service) ListAccessGrants(ctx context.Context, search string, limit int) ([]AccessGrant, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	search = strings.TrimSpace(search)
	rows, err := pool.Query(ctx, accessGrantsQuery, search, "%"+search+"%", limit, optionalUUID(search))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectGrants(rows, 16)
}

// collectGrants lit toutes les lignes d'une requête d'attribution. Toujours non
// nil : une liste vide doit se sérialiser en `[]`, jamais en `null`.
func collectGrants(rows pgx.Rows, capacity int) ([]AccessGrant, error) {
	out := make([]AccessGrant, 0, capacity)
	for rows.Next() {
		grant, err := scanAccessGrant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, grant)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// scanAccessGrant lit une ligne d'attribution (partagé entre liste et fiche).
func scanAccessGrant(row pgx.Row) (AccessGrant, error) {
	var (
		grant     AccessGrant
		name      pgtype.Text
		username  pgtype.Text
		grantedBy pgtype.UUID
		grantedAt pgtype.Timestamp
		expiresAt pgtype.Timestamp
		expired   bool
	)
	if err := row.Scan(&grant.UserID, &grant.Email, &name, &username,
		&grant.RoleKey, &grant.RoleLabel, &grant.RoleIsSystem,
		&grantedBy, &grantedAt, &expiresAt, &expired); err != nil {
		return AccessGrant{}, err
	}
	grant.Name = textPtr(name)
	grant.Username = textPtr(username)
	if grantedBy.Valid {
		v := uuidString(grantedBy)
		grant.GrantedBy = &v
	}
	if grantedAt.Valid {
		grant.GrantedAt = grantedAt.Time.UTC().Format(time.RFC3339)
	}
	if expiresAt.Valid {
		v := expiresAt.Time.UTC().Format(time.RFC3339)
		grant.ExpiresAt = &v
	}
	if expired {
		grant.State = "expired"
	} else {
		grant.State = "active"
	}
	return grant, nil
}

// uuidString rend un UUID pgtype sous forme canonique.
func uuidString(u pgtype.UUID) string {
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// AccessIdentity répond à « pourquoi cette personne détient-elle ceci ? » :
// attributions (avec échéances et provenance), capacités effectives et rôle
// porteur de chacune. Lecture seule.
func (s *Service) AccessIdentity(ctx context.Context, userID string) (*AccessPerson, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	uid := optionalUUID(userID)
	if !uid.Valid {
		return nil, pgx.ErrNoRows
	}

	person := &AccessPerson{
		UserID:            userID,
		Roles:             []AccessGrant{},
		Capabilities:      []string{},
		CapabilitySources: map[string][]string{},
	}

	var legacyRole string
	if err := pool.QueryRow(ctx, accessPersonLegacyQuery, userID).Scan(&legacyRole); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, err
	}
	person.LegacySuperadmin = legacyRole == adminauthz.RoleSuperadmin

	rows, err := pool.Query(ctx, accessGrantsQuery, "", "%%", 500, uid)
	if err != nil {
		return nil, err
	}
	person.Roles, err = collectGrants(rows, 8)
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(person.Roles) > 0 {
		person.Email = person.Roles[0].Email
		person.Name = person.Roles[0].Name
		person.Username = person.Roles[0].Username
	} else {
		// Personne sans attribution : on rend quand même le compte, la fiche
		// sert précisément à lui en attribuer un.
		var name, username pgtype.Text
		if err := pool.QueryRow(ctx,
			`SELECT "email", "name", "username" FROM "User" WHERE "id" = $1::uuid`, userID).
			Scan(&person.Email, &name, &username); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, pgx.ErrNoRows
			}
			return nil, err
		}
		person.Name = textPtr(name)
		person.Username = textPtr(username)
	}

	// Capacités effectives : échéances appliquées, vocabulaire Go seul (une clé
	// en base hors vocabulaire n'accorde rien — même doctrine que le garde).
	caps := adminauthz.Set{}
	capRows, err := pool.Query(ctx, accessPersonCapabilitiesQuery, userID)
	if err != nil {
		return nil, err
	}
	for capRows.Next() {
		var key, roleKey string
		if err := capRows.Scan(&key, &roleKey); err != nil {
			capRows.Close()
			return nil, err
		}
		c := adminauthz.Capability(key)
		if !c.Valid() {
			continue
		}
		caps[c] = true
		person.CapabilitySources[key] = appendUnique(person.CapabilitySources[key], roleKey)
	}
	if err := capRows.Err(); err != nil {
		capRows.Close()
		return nil, err
	}
	capRows.Close()

	if person.LegacySuperadmin {
		for _, c := range adminauthz.AllCapabilities().List() {
			caps[c] = true
			person.CapabilitySources[string(c)] = []string{"promotion historique superadmin"}
		}
	}
	person.Capabilities = caps.Keys()
	return person, nil
}

// appendUnique ajoute une valeur si elle n'est pas déjà présente (les rôles
// porteurs d'une capacité sont peu nombreux mais peuvent se répéter).
func appendUnique(list []string, value string) []string {
	for _, v := range list {
		if v == value {
			return list
		}
	}
	return append(list, value)
}

// AccessRoles rend la matrice rôle × capacité telle que la BASE la porte, avec
// le nombre de détenteurs ACTIFS (échéances appliquées). Lecture seule.
func (s *Service) AccessRoles(ctx context.Context) ([]AccessRole, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	rows, err := pool.Query(ctx, accessRolesQuery)
	if err != nil {
		return nil, err
	}
	byKey := map[string]*AccessRole{}
	order := []string{}
	for rows.Next() {
		var (
			key, label, description string
			isSystem                bool
			capability              string
		)
		if err := rows.Scan(&key, &label, &description, &isSystem, &capability); err != nil {
			rows.Close()
			return nil, err
		}
		entry, ok := byKey[key]
		if !ok {
			entry = &AccessRole{Key: key, Label: label, Description: description, IsSystem: isSystem, Capabilities: []string{}}
			byKey[key] = entry
			order = append(order, key)
		}
		if capability != "" {
			entry.Capabilities = append(entry.Capabilities, capability)
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	holders := map[string]int64{}
	hRows, err := pool.Query(ctx,
		`SELECT "roleKey", COUNT(*) FROM "AdminUserRole"
		  WHERE "expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP
		  GROUP BY "roleKey"`)
	if err != nil {
		return nil, err
	}
	for hRows.Next() {
		var key string
		var count int64
		if err := hRows.Scan(&key, &count); err != nil {
			hRows.Close()
			return nil, err
		}
		holders[key] = count
	}
	if err := hRows.Err(); err != nil {
		hRows.Close()
		return nil, err
	}
	hRows.Close()

	out := make([]AccessRole, 0, len(order))
	for _, key := range order {
		role := byKey[key]
		role.Holders = holders[key]
		out = append(out, *role)
	}
	return out, nil
}

// SearchAccessPeople cherche des personnes à nommer. Motif d'au moins deux
// caractères (le vide n'énumère pas la base). Lecture seule.
func (s *Service) SearchAccessPeople(ctx context.Context, query string, limit int) ([]AccessPersonSummary, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) < 2 {
		return []AccessPersonSummary{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := pool.Query(ctx, accessPeopleQuery, query, "%"+query+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AccessPersonSummary, 0, limit)
	for rows.Next() {
		var (
			person   AccessPersonSummary
			name     pgtype.Text
			username pgtype.Text
			roles    []string
		)
		if err := rows.Scan(&person.UserID, &person.Email, &name, &username, &roles, &person.LegacySuperadmin); err != nil {
			return nil, err
		}
		person.Name = textPtr(name)
		person.Username = textPtr(username)
		person.Roles = append([]string{}, roles...)
		if person.Roles == nil {
			person.Roles = []string{}
		}
		out = append(out, person)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// AccessCapabilities rend le vocabulaire tel que semé en base : la matrice
// affichée par la console vient de là, jamais d'une liste recopiée dans l'UI.
func (s *Service) AccessCapabilities(ctx context.Context) ([]AccessCapability, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	rows, err := pool.Query(ctx, accessCapabilitiesQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]AccessCapability, 0, 41)
	for rows.Next() {
		var c AccessCapability
		if err := rows.Scan(&c.Key, &c.Label, &c.Domain, &c.Description); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// personCapabilitiesTx lit les capacités effectives d'une personne DANS la
// transaction du mouvement : les garde-fous d'escalade comparent toujours le
// même état, même sous concurrence.
func personCapabilitiesTx(ctx context.Context, tx pgx.Tx, userID string) (adminauthz.Set, bool, error) {
	var legacyRole string
	if err := tx.QueryRow(ctx, accessPersonLegacyQuery, userID).Scan(&legacyRole); err != nil {
		return nil, false, err
	}
	legacy := legacyRole == adminauthz.RoleSuperadmin
	caps := adminauthz.Set{}
	if legacy {
		caps = adminauthz.AllCapabilities()
	}
	rows, err := tx.Query(ctx, accessPersonCapabilitiesQuery, userID)
	if err != nil {
		return nil, legacy, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, roleKey string
		if err := rows.Scan(&key, &roleKey); err != nil {
			return nil, legacy, err
		}
		c := adminauthz.Capability(key)
		if !c.Valid() {
			continue
		}
		caps[c] = true
	}
	if err := rows.Err(); err != nil {
		return nil, legacy, err
	}
	return caps, legacy, nil
}

// canDistribute dit si l'acteur peut distribuer OU retirer ce rôle : il doit
// détenir toutes les capacités que le rôle porte. Sans cette règle, un compte
// muni de `admin.access.grant` pourrait s'attribuer `superadmin` (escalade) ou
// déclasser son délégant. Les capacités du rôle viennent du vocabulaire Go —
// jamais de la base, qui pourrait accorder un droit inconnu du code.
func canDistribute(actor adminauthz.Set, roleKey string) bool {
	for _, c := range adminauthz.RoleCapabilities[roleKey] {
		if !actor.Has(c) {
			return false
		}
	}
	return true
}

// GrantAccess attribue un rôle (avec échéance optionnelle) et le prouve :
// motif obligatoire, anti-escalade, audit systématique.
func (s *Service) GrantAccess(ctx context.Context, actorID string, in GrantAccessInput) (*AccessGrant, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	reason, err := motifValidé(in.Reason)
	if err != nil {
		return nil, err
	}
	roleKey := strings.TrimSpace(in.RoleKey)
	if !adminauthz.ValidRole(roleKey) {
		return nil, fmt.Errorf("%w : rôle %q inconnu du vocabulaire", errInvalidAccess, roleKey)
	}
	targetID := strings.TrimSpace(in.UserID)
	if !optionalUUID(targetID).Valid {
		return nil, fmt.Errorf("%w : identifiant de personne invalide", errInvalidAccess)
	}
	expiresAt, err := parseAccessExpiry(in.ExpiresAt)
	if err != nil {
		return nil, err
	}
	if !optionalUUID(actorID).Valid {
		return nil, errForbidden
	}

	grant, err := withTx(ctx, pool, func(tx pgx.Tx) (*AccessGrant, error) {
		if err := tx.QueryRow(ctx, accessUserExistsQuery, targetID).Scan(new(int)); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, pgx.ErrNoRows
			}
			return nil, err
		}
		actorCaps, _, err := personCapabilitiesTx(ctx, tx, actorID)
		if err != nil {
			return nil, err
		}
		if !canDistribute(actorCaps, roleKey) {
			return nil, fmt.Errorf("%w : vous ne détenez pas toutes les capacités du rôle %q (pas d'escalade)", errInvalidAccess, roleKey)
		}
		if _, err := tx.Exec(ctx, accessUpsertGrantQuery, targetID, roleKey, actorID, expiresAt); err != nil {
			return nil, err
		}
		return accessGrantTx(ctx, tx, targetID, roleKey)
	})
	if err != nil {
		return nil, err
	}

	s.logAccessAudit(ctx, actorID, "access.grant", string(adminauthz.AccessGrant), targetID, reason,
		nil,
		map[string]any{"roleKey": roleKey, "expiresAt": in.ExpiresAt},
	)
	return grant, nil
}

// RevokeAccess révoque un rôle : motif obligatoire, garde-fous (dernier rôle de
// soi-même, dernier superadmin de la plateforme, pas de déclassement au-dessus
// de soi), audit systématique.
func (s *Service) RevokeAccess(ctx context.Context, actorID, targetID, roleKey, reason string) (*AccessGrant, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	reason, err = motifValidé(reason)
	if err != nil {
		return nil, err
	}
	roleKey = strings.TrimSpace(roleKey)
	if !adminauthz.ValidRole(roleKey) {
		return nil, fmt.Errorf("%w : rôle %q inconnu du vocabulaire", errInvalidAccess, roleKey)
	}
	targetID = strings.TrimSpace(targetID)
	if !optionalUUID(targetID).Valid {
		return nil, fmt.Errorf("%w : identifiant de personne invalide", errInvalidAccess)
	}
	if !optionalUUID(actorID).Valid {
		return nil, errForbidden
	}

	revoked, err := withTx(ctx, pool, func(tx pgx.Tx) (*AccessGrant, error) {
		// État lu AVANT la suppression : c'est lui qu'on rend à l'interface		// (l'écran affiche ce qui vient d'être retiré).
		before, err := accessGrantTx(ctx, tx, targetID, roleKey)
		if err != nil {
			return nil, err
		}

		_, targetLegacy, err := personCapabilitiesTx(ctx, tx, targetID)
		if err != nil {
			return nil, err
		}
		actorCaps, _, err := personCapabilitiesTx(ctx, tx, actorID)
		if err != nil {
			return nil, err
		}
		if !canDistribute(actorCaps, roleKey) {
			return nil, fmt.Errorf("%w : vous ne détenez pas toutes les capacités du rôle %q (on ne déclasse pas au-dessus de soi)", errInvalidAccess, roleKey)
		}

		// Retirer son propre DERNIER rôle actif : refusé, sauf promotion
		// historique superadmin (qui conserve toutes les capacités — il n'y a
		// alors aucun verrouillage, seulement un rang rendu explicite).
		if targetID == actorID && !targetLegacy {
			var active int64
			if err := tx.QueryRow(ctx, accessActiveRolesQuery, targetID).Scan(&active); err != nil {
				return nil, err
			}
			if active <= 1 {
				return nil, fmt.Errorf("%w : retirer votre dernier rôle vous fermerait la console", errInvalidAccess)
			}
		}

		// Dernier superadmin de la plateforme : refusé, sauf s'il garde la
		// promotion historique (le vrai verrouillage est ce qu'on interdit).
		if roleKey == adminauthz.RoleSuperadmin && !targetLegacy {
			var others int64
			if err := tx.QueryRow(ctx, accessActiveRoleHoldersQuery, roleKey).Scan(&others); err != nil {
				return nil, err
			}
			if others <= 1 {
				return nil, fmt.Errorf("%w : révoquer le dernier superadmin de la plateforme est interdit", errInvalidAccess)
			}
		}

		tag, err := tx.Exec(ctx, accessDeleteGrantQuery, targetID, roleKey)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, pgx.ErrNoRows
		}
		return before, nil
	})
	if err != nil {
		return nil, err
	}

	s.logAccessAudit(ctx, actorID, "access.revoke", string(adminauthz.AccessGrant), targetID, reason,
		map[string]any{"roleKey": revoked.RoleKey, "expiresAt": revoked.ExpiresAt},
		nil,
	)
	return revoked, nil
}

// accessGrantTx lit une attribution précise (ou pgx.ErrNoRows).
func accessGrantTx(ctx context.Context, tx pgx.Tx, userID, roleKey string) (*AccessGrant, error) {
	rows, err := tx.Query(ctx, accessGrantsQuery, "", "%%", 1_000_000, optionalUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	grants, err := collectGrants(rows, 8)
	if err != nil {
		return nil, err
	}
	for _, grant := range grants {
		if grant.RoleKey == roleKey {
			out := grant
			return &out, nil
		}
	}
	return nil, pgx.ErrNoRows
}

// withTx factorise le motif « transaction, ou rien » : les garde-fous d'accès
// n'ont de valeur que s'ils lisent et écrivent le même état.
func withTx[T any](ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) (T, error)) (T, error) {
	var zero T
	tx, err := pool.Begin(ctx)
	if err != nil {
		return zero, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	out, err := fn(tx)
	if err != nil {
		return zero, err
	}
	if err := tx.Commit(ctx); err != nil {
		return zero, err
	}
	return out, nil
}

// insertAccessAuditQuery écrit une trace de mouvement de droits avec TOUT ce
// qu'une relecture demande : capacité exercée, motif, et diff avant/après.
// (Les colonnes viennent de la migration 00057.)
const insertAccessAuditQuery = `
	INSERT INTO "AdminAuditLog"
	    ("id", "actorId", "action", "targetType", "targetId", "metadata",
	     "capability", "reason", "before", "after")
	VALUES (gen_random_uuid()::text, $1::uuid, $2, 'admin_user_role', $3, $4,
	        $5, $6, $7, $8)`

// logAccessAudit écrit la trace d'un mouvement de droits, TOUJOURS. Le flag
// `admin-audit-log` gouverne le journal d'audit générique de la console ; un
// changement d'attribution, lui, doit rester traçable même flag éteint —
// sinon la console saurait nommer des gens sans que personne ne puisse dire
// qui l'a fait ni pourquoi.
func (s *Service) logAccessAudit(ctx context.Context, actorID, action, capability, targetID, reason string, before, after any) {
	if s == nil || s.pool == nil {
		return
	}
	var actorUUID pgtype.UUID
	if err := actorUUID.Scan(actorID); err != nil {
		return
	}
	metadata, err := json.Marshal(map[string]any{"reason": reason})
	if err != nil {
		return
	}
	beforeRaw, err := json.Marshal(before)
	if err != nil || string(beforeRaw) == "null" {
		beforeRaw = nil
	}
	afterRaw, err := json.Marshal(after)
	if err != nil || string(afterRaw) == "null" {
		afterRaw = nil
	}
	if _, err := s.pool.Exec(ctx, insertAccessAuditQuery,
		actorID, action, targetID, string(metadata), capability, reason,
		nullableJSON(beforeRaw), nullableJSON(afterRaw)); err != nil {
		// Un audit manqué est une panne d'exploitation : on la voit.
		log.Printf("[admin-access-audit] %s : %v", action, err)
	}
}

// nullableJSON rend un JSONB NULL plutôt qu'une chaîne vide (une colonne vide
// serait un diff, pas une absence de diff).
func nullableJSON(raw []byte) any {
	if len(raw) == 0 {
		return nil
	}
	return string(raw)
}

// InvalidateAccess oublie l'accès en cache d'une personne. Branché par le
// handler sur le service de capacités : une attribution prend effet
// immédiatement, sans attendre le TTL de 30 s — nommer quelqu'un et le voir
// refusé dans la foulée est exactement le genre de flou qu'on supprime.
func (h *Handler) InvalidateAccess(userID string) {
	if h == nil || h.console == nil || userID == "" {
		return
	}
	if inv, ok := h.console.Lookup().(interface{ Invalidate(string) }); ok && inv != nil {
		inv.Invalidate(userID)
	}
}
