package users

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/shared/identifier"
	"github.com/qoefi/api/internal/slug"
)

// ErrRegistrationsClosed signale que la plateforme a fermé les inscriptions
// (SystemConfig ALLOW_NEW_REGISTRATIONS=false) : la ligne User n'est pas créée.
var ErrRegistrationsClosed = errors.New("les inscriptions sont temporairement fermées")

// ErrEmailNotInvited signale qu'en accès privé (inscriptions fermées), l'email
// ne figure pas dans l'allowlist d'invitation (ou a déjà été utilisé).
var ErrEmailNotInvited = errors.New("inscriptions sur invitation : cet email n'est pas invité")

// ErrConfigUnreadable signale qu'un réglage plateforme n'a pas pu être lu :
// on ne devine JAMAIS la valeur (un kill-switch illisible ne s'ouvre pas).
var ErrConfigUnreadable = errors.New("réglage plateforme illisible")

// readConfig lit une valeur SystemConfig. Une clé absente vaut "" (défaut
// documenté par l'appelant) ; une panne est remontée.
func (s *Service) readConfig(ctx context.Context, key string) (string, error) {
	var v string
	err := s.pool.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key=$1`, key).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("%w: %s: %v", ErrConfigUnreadable, key, err)
	}
	return v, nil
}

// normalizeAllowlistEmail normalise un email d'allowlist (comparaisons
// insensibles à la casse et aux espaces, côté Go comme côté admin).
func normalizeAllowlistEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// registrationsOpen lit le kill-switch d'inscriptions (défaut : ouvert).
// Une erreur de lecture ferme l'accès (fail-closed) : mieux vaut refuser une
// inscription que d'en accepter quand l'admin a coupé l'accès.
func (s *Service) registrationsOpen(ctx context.Context) (bool, error) {
	v, err := s.readConfig(ctx, "ALLOW_NEW_REGISTRATIONS")
	if err != nil {
		return false, err
	}
	return !strings.EqualFold(v, "false"), nil
}

// checkAllowlist vérifie qu'un email figure dans l'allowlist d'invitation
// et n'a pas encore été utilisé (usage unique par invitation).
func (s *Service) checkAllowlist(ctx context.Context, email string) (bool, error) {
	normalized := normalizeAllowlistEmail(email)
	if normalized == "" {
		return false, nil
	}
	var ok bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM "RegistrationAllowlist" WHERE email = $1 AND "usedAt" IS NULL)`,
		normalized).Scan(&ok); err != nil {
		return false, err
	}
	return ok, nil
}

// consumeAllowlist marque une invitation comme utilisée après création du
// compte (best-effort : un échec ne bloque jamais l'inscription réussie).
func (s *Service) consumeAllowlist(ctx context.Context, email, userID string) {
	normalized := normalizeAllowlistEmail(email)
	if normalized == "" {
		return
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE "RegistrationAllowlist" SET "usedAt" = now(), "usedBy" = $2
		 WHERE email = $1 AND "usedAt" IS NULL`, normalized, userID); err != nil {
		// L'inscription est déjà faite : on ne la casse pas, mais une
		// invitation qui reste consommable doit apparaître dans les logs.
		log.Printf("[users] invitation non consommée (%s): %v", normalized, err)
	}
}

// RegistrationStatus expose l'état des inscriptions pour le front (page
// login : bannière "fermé" + pré-contrôle avant supabase.auth.signUp, pour
// ne pas créer de compte Auth orphelin). `allowed` = cet email peut
// s'inscrire (ouvert à tous OU invité). La réponse ne révèle que
// l'appartenance à l'allowlist, jamais l'existence d'un compte.
func (s *Service) RegistrationStatus(ctx context.Context, email string) (open, allowed bool, err error) {
	isOpen, err := s.registrationsOpen(ctx)
	if err != nil {
		return false, false, err
	}
	if isOpen {
		return true, true, nil
	}
	allowed, err = s.checkAllowlist(ctx, email)
	if err != nil {
		return false, false, err
	}
	return false, allowed, nil
}

// SyncUserFromAuth crée (ou met à jour) la ligne User depuis les claims du
// JWT Supabase — parité syncUserFromAuth Prisma (routes /auth/callback).
// Variante sans métadonnées de requête (auto-réparation, tests).
func (s *Service) SyncUserFromAuth(ctx context.Context, userID string, claims map[string]any) (created, needsOnboarding bool, err error) {
	return s.syncUserFromAuth(ctx, userID, claims, requestMeta{})
}

// syncUserFromAuth est l'implémentation réelle : elle reçoit en plus l'origine
// de la requête, qui sert d'élément de preuve aux consentements d'inscription.
func (s *Service) syncUserFromAuth(ctx context.Context, userID string, claims map[string]any, origin requestMeta) (created, needsOnboarding bool, err error) {
	email, _ := claims["email"].(string)
	meta, _ := claims["user_metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	str := func(v any) string {
		if s, ok := v.(string); ok {
			if t := strings.TrimSpace(s); t != "" {
				return t
			}
		}
		return ""
	}
	name := str(meta["name"])
	if name == "" {
		name = str(meta["full_name"])
	}
	username := str(meta["username"])
	pronouns := str(meta["pronouns"])
	countryCode := str(meta["countryCode"])
	languageCode := str(meta["languageCode"])

	var role, existingOnboarding string
	var exists bool
	err = s.pool.QueryRow(ctx,
		`SELECT role, "hasCompletedOnboarding"::text FROM "User" WHERE id = $1`, userID).Scan(&role, &existingOnboarding)
	if err == nil {
		exists = true
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return false, false, err
	}

	if !exists {
		// 🚪 Inscriptions fermées ? La clé SystemConfig ALLOW_NEW_REGISTRATIONS
		// (toggle admin) bloque la création de NOUVELLES lignes User, sauf
		// pour les emails invités (allowlist admin, usage unique). Les
		// comptes existants continuent de fonctionner. Défaut : ouvert.
		open, cerr := s.registrationsOpen(ctx)
		if cerr != nil {
			return false, false, cerr
		}
		if !open {
			allowed, aerr := s.checkAllowlist(ctx, email)
			if aerr != nil {
				return false, false, aerr
			}
			if !allowed {
				// Distingue "fermé à tous" d'"email non invité" pour des
				// messages front adaptés (même statut HTTP 403).
				if email == "" {
					return false, false, ErrRegistrationsClosed
				}
				return false, false, ErrEmailNotInvited
			}
		}
		finalUsername := safeProvisionedUsername(email, username)
		var usernameTaken bool
		err = s.pool.QueryRow(ctx,
			`SELECT EXISTS(
				SELECT 1 FROM "User" WHERE lower(username) = lower($1)
				UNION
				SELECT 1 FROM "Publisher" WHERE lower(slug) = lower($1) AND type <> 'PERSONAL'
			)`, finalUsername).Scan(&usernameTaken)
		if err == nil && usernameTaken {
			finalUsername = uniqueProvisionedUsername(ctx, s.pool, finalUsername)
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return false, false, err
		}
		displayName := name
		if displayName == "" {
			prefix := "user"
			if email != "" {
				prefix = strings.Split(email, "@")[0]
			}
			displayName = prefix
		}
		_, insertErr := s.pool.Exec(ctx,
			`INSERT INTO "User" (id, email, name, username, role, "hasCompletedOnboarding", pronouns, "countryCode", "languageCode", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $4, 'user', false, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), now(), now())`,
			userID, email, displayName, finalUsername, pronouns, countryCode, languageCode)
		// Toute violation d'unicité signifie qu'un compte concurrent (même
		// email, ou même id créé par un autre /v1/me/sync) vient de naître :
		// on bascule sur le chemin « existe déjà » au lieu de répondre 500.
		if insertErr != nil && !isUniqueViolation(insertErr) {
			return false, false, insertErr
		}
		if insertErr == nil {
			// 🆕 Le compte vient de naître : on ancre ici les acceptations
			// cochées au formulaire d'inscription (métadonnées du JWT).
			s.recordSignupConsent(ctx, userID, claims, origin)
			// Invitation consommée (accès privé) : usage unique.
			s.consumeAllowlist(ctx, email, userID)
			// Initialise sa publication personnelle pour que son profil /@username existe toujours
			if _, perr := s.GetOrCreatePersonalPublisher(ctx, userID); perr != nil {
				log.Printf("[users] publication personnelle non créée (%s): %v", userID, perr)
			}
			return true, true, nil
		}
		// L'email existe déjà avec un AUTRE id (session Supabase plus récente
		// que la ligne DB — base reseedée, backup restauré, compte recréé) :
		// on ADOPTE la ligne existante en re-pointant son id vers le JWT. Les
		// FKs vers User(id) sont ON UPDATE CASCADE → articles, posts, likes,
		// follows… suivent sans orphelins.
		if _, adoptErr := s.pool.Exec(ctx,
			`UPDATE "User" SET id = $1, "updatedAt" = now() WHERE email = $2 AND id <> $1`,
			userID, email); adoptErr != nil {
			return false, false, adoptErr
		}
		// Relit le profil comme un user existant (role, onboarding).
		if err := s.pool.QueryRow(ctx,
			`SELECT role, "hasCompletedOnboarding"::text FROM "User" WHERE id = $1`, userID).Scan(&role, &existingOnboarding); err != nil {
			return false, false, err
		}
		exists = true
	}

	// User existant : auto-réparation profil — si username/name sont vides en
	// DB (comptes seedés / backup avec colonnes manquantes), on les remplit
	// depuis les claims à chaque login, SANS écraser ce qui est déjà renseigné.
	// Évite le rendu systématique @user (le front tombe sur un fallback 'user'
	// quand le username DB est NULL). On se base sur les VALEURS DB, pas sur
	// les claims : un username explicite dans user_metadata doit bien s'écrire
	// quand la colonne est vide.
	var dbName, dbUsername, dbPubID pgtype.Text
	if err := s.pool.QueryRow(ctx,
		`SELECT name, username, "publisherId" FROM "User" WHERE id = $1`, userID).Scan(&dbName, &dbUsername, &dbPubID); err != nil {
		return false, false, err
	}
	if !dbPubID.Valid || dbPubID.String == "" {
		if _, perr := s.GetOrCreatePersonalPublisher(ctx, userID); perr != nil {
			log.Printf("[users] publication personnelle non créée (%s): %v", userID, perr)
		}
	}
	needsUsername := !dbUsername.Valid || dbUsername.String == ""
	if needsUsername || !dbName.Valid || dbName.String == "" {
		// Username à écrire : dérivé des claims (meta sinon email), uniquement
		// si la colonne est réellement vide (évite d'écraser un username pris).
		newUsername := safeProvisionedUsername(email, username)
		if !needsUsername {
			newUsername = ""
		}
		if _, err = s.pool.Exec(ctx,
			`UPDATE "User"
			 SET username = COALESCE(NULLIF($1, ''), username),
			     name     = COALESCE(NULLIF($2, ''), name),
			     "updatedAt" = now()
			 WHERE id = $3 AND (username IS NULL OR username = '' OR name IS NULL OR name = '')`,
			newUsername, name, userID); err != nil {
			return false, false, err
		}
	}

	// User existant : propagation des champs profil si renseignés.
	if pronouns != "" || countryCode != "" || languageCode != "" {
		_, err = s.pool.Exec(ctx,
			`UPDATE "User"
			 SET pronouns = COALESCE(NULLIF($2, ''), pronouns),
			     "countryCode" = COALESCE(NULLIF($3, ''), "countryCode"),
			     "languageCode" = COALESCE(NULLIF($4, ''), "languageCode"),
			     "updatedAt" = now()
			 WHERE id = $1`,
			userID, pronouns, countryCode, languageCode)
		if err != nil {
			return false, false, err
		}
	}
	return false, role == "user" && existingOnboarding == "false", nil
}

// derivedUserName calcule un username de base valide [a-z0-9_-] : soit le
// claim `username` (sanitisé), soit le préfixe de l'email, soit "user" en
// dernier recours. L'unicité n'est PAS gérée ici (binding côté création).
func derivedUserName(email, username string) string {
	return safeProvisionedUsername(email, username)
}

// safeProvisionedUsername applique exactement le contrat public des usernames,
// y compris pour l'inscription/JIT OAuth. Les claims ne sont jamais écrits
// directement en base.
func safeProvisionedUsername(email, username string) string {
	candidate := identifier.NormalizeUsername(username)
	candidate = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '.' {
			return r
		}
		return -1
	}, candidate)
	candidate = strings.Trim(candidate, "._")
	if !identifier.ValidUsername(candidate) || identifier.IsReserved(candidate) {
		candidate = strings.Split(email, "@")[0]
		candidate = strings.ToLower(strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				return r
			}
			return -1
		}, candidate))
	}
	if !identifier.ValidUsername(candidate) || identifier.IsReserved(candidate) {
		candidate = "user"
	}
	return candidate
}

func uniqueProvisionedUsername(ctx context.Context, pool pooler, base string) string {
	queryExists := `SELECT EXISTS(
		SELECT 1 FROM "User" WHERE lower(username) = lower($1)
		UNION
		SELECT 1 FROM "Publisher" WHERE lower(slug) = lower($1) AND type <> 'PERSONAL'
	)`
	for i := 1; i <= 30; i++ {
		candidate := fmt.Sprintf("%s%d", base, i)
		if len(candidate) > 24 {
			candidate = candidate[:24]
			candidate = strings.TrimRight(candidate, "._")
		}
		var exists bool
		if err := pool.QueryRow(ctx, queryExists, candidate).Scan(&exists); err == nil && !exists {
			return candidate
		}
	}
	for i := 0; i < 8; i++ {
		candidate := base + "_" + strings.ToLower(shortID())
		if len(candidate) > 24 {
			candidate = candidate[:24]
			candidate = strings.TrimRight(candidate, "._")
		}
		var exists bool
		if err := pool.QueryRow(ctx, queryExists, candidate).Scan(&exists); err == nil && !exists {
			return candidate
		}
	}
	return "user_" + strings.ToLower(shortID())
}

func shortID() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// GetOrCreatePersonalPublisher résout la publication personnelle de
// l'utilisateur, en la créant si elle n'existe pas (parité
// publications.getOrCreatePersonalPublisher Prisma).
func (s *Service) GetOrCreatePersonalPublisher(ctx context.Context, userID string) (string, error) {
	// 1. Publication déjà liée ?
	var pubID pgtype.Text
	err := s.pool.QueryRow(ctx,
		`SELECT "publisherId" FROM "User" WHERE id = $1`, userID).Scan(&pubID)
	if err != nil {
		return "", err
	}
	if pubID.Valid && pubID.String != "" {
		return pubID.String, nil
	}

	// 2. Création de la publication personnelle (slug depuis username/name).
	var name, username, logoURL pgtype.Text
	err = s.pool.QueryRow(ctx,
		`SELECT name, username, "logoUrl" FROM "User" WHERE id = $1`, userID).Scan(&name, &username, &logoURL)
	if err != nil {
		return "", err
	}
	displayName := name.String
	if displayName == "" {
		displayName = username.String
	}
	if displayName == "" {
		displayName = "Lecteur"
	}

	pubSlug := username.String
	if pubSlug == "" {
		pubSlug = slug.Slugify(displayName)
	}
	if pubSlug == "" {
		pubSlug = "creator"
	}

	var slugConflict bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM "Publisher" WHERE lower(slug) = lower($1))`, pubSlug).Scan(&slugConflict); err != nil {
		return "", err
	}
	if slugConflict {
		pubSlug = uniqueProvisionedUsername(ctx, s.pool, pubSlug)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	// Verrouille la ligne User : deux appels concurrents (login + GET
	// /v1/me/publication) ne doivent pas créer deux publications orphelines.
	var lockedID pgtype.Text
	if err := tx.QueryRow(ctx,
		`SELECT "publisherId" FROM "User" WHERE id = $1 FOR UPDATE`, userID).Scan(&lockedID); err != nil {
		return "", err
	}
	if lockedID.Valid && lockedID.String != "" {
		return lockedID.String, nil
	}

	var createdID string
	err = tx.QueryRow(ctx,
		`INSERT INTO "Publisher" (id, type, name, slug, "subdomain", "heroText", "layoutStyle",
		                           "logoUrl", "isCertified", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'PERSONAL', $1, $2, NULL, NULL, 'default',
		         NULLIF($3, ''), false, now())
		 RETURNING id`, displayName, pubSlug, logoURL.String).Scan(&createdID)
	if err != nil {
		return "", err
	}

	_, err = tx.Exec(ctx,
		`UPDATE "User" SET "publisherId" = $2, "updatedAt" = now() WHERE id = $1`,
		userID, createdID)
	if err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return createdID, nil
}

// maxMutedWords borne la liste de mots masqués d'un compte.
const maxMutedWords = 200

var errTooManyMutedWords = errors.New("Maximum 200 mots masqués autorisés.")

// ToggleMuteWord ajoute ou retire un mot masqué (parité
// moderation.toggleMuteWord Prisma : normalisé lowercase/trim).
func (s *Service) ToggleMuteWord(ctx context.Context, userID, rawWord string) (bool, string, error) {
	cleaned, err := antispam.SanitizeAndValidateText(rawWord, 1, 100, antispam.TextOptions{
		AllowNewlines: false,
		CheckXSS:      true,
	})
	if err != nil {
		return false, "", invalid(err.Error())
	}
	word := strings.ToLower(cleaned)

	var existingID string
	err = s.pool.QueryRow(ctx,
		`SELECT id FROM "MutedWord" WHERE "userId" = $1 AND word = $2`, userID, word).Scan(&existingID)
	if err == nil {
		_, err = s.pool.Exec(ctx, `DELETE FROM "MutedWord" WHERE id = $1`, existingID)
		if err != nil {
			return false, "", err
		}
		return false, word, nil
	}
	var count int
	if cerr := s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "MutedWord" WHERE "userId" = $1`, userID).Scan(&count); cerr != nil {
		return false, "", cerr
	}
	if count >= maxMutedWords {
		return false, "", invalid(errTooManyMutedWords.Error())
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, "", err
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO "MutedWord" (id, word, "userId") VALUES (gen_random_uuid()::text, $1, $2)`,
		word, userID)
	if err != nil {
		return false, "", err
	}
	return true, word, nil
}

// ListMutedWords renvoie tous les mots masqués de l'utilisateur, triés du
// plus récent au plus ancien (parité feed.fetchMutedWordsAll).
func (s *Service) ListMutedWords(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT word FROM "MutedWord" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
		toUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	var word string
	for rows.Next() {
		if err := rows.Scan(&word); err != nil {
			return nil, err
		}
		out = append(out, word)
	}
	return out, rows.Err()
}

// articleUnlockPriceCents est le prix de déblocage d'un article premium,
// lu côté serveur (SystemConfig ARTICLE_UNLOCK_PRICE_CENTS, défaut 100 —
// même valeur que la constante front). Le client ne fixe JAMAIS le montant :
// un `costCents` envoyé par le navigateur débitait 1 centime.
const articleUnlockPriceCents = 100

// ArticleUnlockPrice lit le prix serveur du déblocage à l'unité.
func (s *Service) ArticleUnlockPrice(ctx context.Context) (int, error) {
	raw, err := s.readConfig(ctx, "ARTICLE_UNLOCK_PRICE_CENTS")
	if err != nil {
		return 0, err
	}
	if raw == "" {
		return articleUnlockPriceCents, nil
	}
	price, convErr := strconv.Atoi(strings.TrimSpace(raw))
	if convErr != nil || price <= 0 {
		return 0, fmt.Errorf("%w: ARTICLE_UNLOCK_PRICE_CENTS=%q", ErrConfigUnreadable, raw)
	}
	return price, nil
}

// UnlockArticleWithWallet débite le lecteur et crédite le propriétaire
// (parité wallet.unlockArticleWithWallet Prisma, transaction atomique). Le
// débit est conditionnel (`balance >= price`) : deux clics simultanés ne
// peuvent pas rendre le solde négatif.
func (s *Service) UnlockArticleWithWallet(ctx context.Context, readerID, publisherID string) (string, error) {
	price, err := s.ArticleUnlockPrice(ctx)
	if err != nil {
		return "", err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	res, err := tx.Exec(ctx,
		`UPDATE "User" SET "walletBalanceCents" = "walletBalanceCents" - $2, "updatedAt" = now()
		 WHERE id = $1 AND "walletBalanceCents" >= $2`, readerID, price)
	if err != nil {
		return "TRANSACTION_FAILED", err
	}
	if res.RowsAffected() == 0 {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "User" WHERE id = $1)`, readerID).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return "USER_NOT_FOUND", nil
		}
		return "INSUFFICIENT_FUNDS", nil
	}

	ownerID, err := publisherOwnerID(ctx, tx, publisherID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "PUBLICATION_NOT_FOUND", nil
		}
		return "PUBLICATION_NOT_FOUND", err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type)
		 VALUES (gen_random_uuid()::text, $1, $2, 'PAYWALL_UNLOCK')`,
		readerID, -price); err != nil {
		return "TRANSACTION_FAILED", err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE "User" SET "walletBalanceCents" = "walletBalanceCents" + $2, "updatedAt" = now() WHERE id = $1`,
		ownerID, price); err != nil {
		return "TRANSACTION_FAILED", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "TRANSACTION_FAILED", err
	}
	return "", nil
}

// rowQuerier est la surface de lecture partagée par le pool et une transaction.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// publisherOwnerID résout le propriétaire d'une publication (créateur perso
// ou owner du média) dans la transaction de débit : la lecture et l'écriture
// voient le même état.
func publisherOwnerID(ctx context.Context, q rowQuerier, publisherID string) (string, error) {
	var ownerID string
	err := q.QueryRow(ctx,
		`SELECT id::text FROM "User" WHERE "publisherId" = $1`, publisherID).Scan(&ownerID)
	if err == nil {
		return ownerID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	err = q.QueryRow(ctx,
		`SELECT mm."userId"::text
		 FROM "MediaMember" mm
		 JOIN "Media" md ON md.id = mm."mediaId"
		 WHERE md."publisherId" = $1 AND mm.role = 'owner' AND mm.status = 'active'
		 LIMIT 1`, publisherID).Scan(&ownerID)
	if err != nil {
		return "", err
	}
	return ownerID, nil
}

// isEmailConflict détecte la violation d'unicité sur User.email
// (SQLSTATE 23505, contrainte User_email_key).
func isEmailConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "User_email_key"
}

// ── Téléphone vérifié : friction anti-abus, jamais MFA forte (fiche 05) ──────
//
// Ce bloc ne fait qu'enregistrer et lire une preuve de possession d'un numéro
// fournie par le fournisseur d'authentification. Il ne délivre aucun droit :
// les capacités qui dépendent du numéro passent par le registre d'actions de
// internal/authz (prérequis `phone_verified` distinct de la MFA forte).

// ErrPhoneNumberTaken signale qu'un autre compte a déjà déclaré ce numéro.
var ErrPhoneNumberTaken = errors.New("ce numéro est déjà associé à un autre compte")

// PhoneVerification décrit l'état du numéro d'un compte. Le numéro n'est
// destiné qu'aux parcours de sécurité du titulaire : il ne doit pas être
// exposé aux créateurs, aux membres d'un média ni dans les interfaces
// publiques.
//
// Ne pas confondre avec l'assurance de la session : `VerifiedAt` non nul ne
// signifie pas « session fortement authentifiée ».
type PhoneVerification struct {
	Number     string     `json:"number"`
	VerifiedAt *time.Time `json:"verifiedAt,omitempty"`
}

// PhoneStatus lit l'état de vérification du numéro d'un compte.
func (s *Service) PhoneStatus(ctx context.Context, userID string) (PhoneVerification, error) {
	var out PhoneVerification
	var number pgtype.Text
	var verifiedAt pgtype.Timestamp
	err := s.pool.QueryRow(ctx,
		`SELECT "phoneNumber", "phoneVerifiedAt" FROM "User" WHERE id = $1`,
		toUUID(userID)).Scan(&number, &verifiedAt)
	if err != nil {
		return out, err
	}
	if number.Valid {
		out.Number = number.String
	}
	if verifiedAt.Valid {
		t := verifiedAt.Time.UTC()
		out.VerifiedAt = &t
	}
	return out, nil
}

// PhoneVerified indique si le compte dispose d'un numéro vérifié. C'est le
// prérequis anti-abus utilisé par internal/authz — il ne dit rien de la MFA
// forte, qui reste évaluée sur la session.
func (s *Service) PhoneVerified(ctx context.Context, userID string) (bool, error) {
	var verified bool
	err := s.pool.QueryRow(ctx,
		`SELECT "phoneVerifiedAt" IS NOT NULL FROM "User" WHERE id = $1`,
		toUUID(userID)).Scan(&verified)
	if err != nil {
		return false, err
	}
	return verified, nil
}

// MarkPhoneVerified enregistre un numéro dont la possession vient d'être
// prouvée par le fournisseur. Ne jamais appeler cette méthode depuis une route
// qui se contente d'un numéro simplement déclaré par le client.
func (s *Service) MarkPhoneVerified(ctx context.Context, userID, number string, at time.Time) error {
	number = strings.TrimSpace(number)
	if number == "" {
		return errors.New("numéro de téléphone vide")
	}
	if at.IsZero() {
		at = time.Now().UTC()
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE "User" SET "phoneNumber" = $2, "phoneVerifiedAt" = $3, "updatedAt" = now() WHERE id = $1`,
		toUUID(userID), number, at.UTC())
	if err != nil {
		if isPhoneNumberConflict(err) {
			return ErrPhoneNumberTaken
		}
		return err
	}
	s.trustSvc.InvalidateUser(ctx, userID)
	return nil
}

// ClearPhoneVerification retire le numéro (changement de numéro, suppression de
// compte) : les capacités qui en dépendent redeviennent indisponibles
// immédiatement, sans attendre l'expiration d'une session.
func (s *Service) ClearPhoneVerification(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE "User" SET "phoneNumber" = NULL, "phoneVerifiedAt" = NULL, "updatedAt" = now() WHERE id = $1`,
		toUUID(userID))
	if err != nil {
		return err
	}
	s.trustSvc.InvalidateUser(ctx, userID)
	return nil
}

// isPhoneNumberConflict détecte la violation d'unicité sur User.phoneNumber
// (SQLSTATE 23505, contrainte User_phoneNumber_key).
func isPhoneNumberConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "User_phoneNumber_key"
}
