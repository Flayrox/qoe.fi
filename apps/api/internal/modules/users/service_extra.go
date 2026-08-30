package users

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/shared/identifier"
	"github.com/qoefi/api/internal/slug"
)

// SyncUserFromAuth crée (ou met à jour) la ligne User depuis les claims du
// JWT Supabase — parité syncUserFromAuth Prisma (routes /auth/callback).
func (s *Service) SyncUserFromAuth(ctx context.Context, userID string, claims map[string]any) (created, needsOnboarding bool, err error) {
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
	var usernameTaken pgtype.Text
	err = s.pool.QueryRow(ctx,
		`SELECT role, "hasCompletedOnboarding"::text FROM "User" WHERE id = $1`, userID).Scan(&role, &existingOnboarding)
	if err == nil {
		exists = true
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return false, false, err
	}

	if !exists {
		finalUsername := safeProvisionedUsername(email, username)
		// Unicité : suffixe aléatoire si le username est pris. La contrainte
		// unique reste l'autorité finale en cas de course concurrente.
		err = s.pool.QueryRow(ctx,
			`SELECT username FROM "User" WHERE lower(username) = lower($1)`, finalUsername).Scan(&usernameTaken)
		if err == nil {
			finalUsername = uniqueProvisionedUsername(ctx, s.pool, finalUsername)
		} else if !errors.Is(err, pgx.ErrNoRows) {
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
		if insertErr != nil && !isEmailConflict(insertErr) {
			return false, false, insertErr
		}
		if insertErr == nil {
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
	var dbName, dbUsername pgtype.Text
	_ = s.pool.QueryRow(ctx,
		`SELECT name, username FROM "User" WHERE id = $1`, userID).Scan(&dbName, &dbUsername)
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
	for i := 0; i < 8; i++ {
		candidate := base + "_" + strings.ToLower(shortID())
		if len(candidate) > 24 {
			candidate = candidate[:24]
			candidate = strings.TrimRight(candidate, "._")
		}
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "User" WHERE lower(username) = lower($1))`, candidate).Scan(&exists); err == nil && !exists {
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

// GetOrCreatePersonalPublication résout la publication personnelle de
// l'utilisateur, en la créant si elle n'existe pas (parité
// publications.getOrCreatePersonalPublication Prisma).
func (s *Service) GetOrCreatePersonalPublication(ctx context.Context, userID string) (string, error) {
	// 1. Publication déjà liée ?
	var pubID pgtype.Text
	err := s.pool.QueryRow(ctx,
		`SELECT "publicationId" FROM "User" WHERE id = $1`, userID).Scan(&pubID)
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
	base := name.String
	if base == "" {
		base = username.String
	}
	if base == "" {
		base = "creator"
	}
	pubSlug := slug.Slugify(base)
	if pubSlug == "" {
		pubSlug = "creator"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var createdID string
	err = tx.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "subdomain", "heroText", "layoutStyle",
		                           "logoUrl", "isCertified", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'PERSONAL', $1, $2, NULL, NULL, 'default',
		         NULLIF($3, ''), false, now())
		 RETURNING id`, base, pubSlug, logoURL.String).Scan(&createdID)
	if err != nil {
		return "", err
	}

	_, err = tx.Exec(ctx,
		`UPDATE "User" SET "publicationId" = $2, "updatedAt" = now() WHERE id = $1`,
		userID, createdID)
	if err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return createdID, nil
}

// ToggleMuteWord ajoute ou retire un mot masqué (parité
// moderation.toggleMuteWord Prisma : normalisé lowercase/trim).
func (s *Service) ToggleMuteWord(ctx context.Context, userID, rawWord string) (bool, string, error) {
	word := strings.ToLower(strings.TrimSpace(rawWord))
	if word == "" {
		return false, "", errors.New("Mot-clé invalide.")
	}

	var existingID string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM "MutedWord" WHERE "userId" = $1 AND word = $2`, userID, word).Scan(&existingID)
	if err == nil {
		_, err = s.pool.Exec(ctx, `DELETE FROM "MutedWord" WHERE id = $1`, existingID)
		if err != nil {
			return false, "", err
		}
		return false, word, nil
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
			continue
		}
		out = append(out, word)
	}
	return out, rows.Err()
}

// getPublicationOwnerID résout le propriétaire d'une publication :
// créateur perso (user.publicationId) OU owner du média.
func (s *Service) getPublicationOwnerID(ctx context.Context, publicationID string) (string, error) {
	var ownerID string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM "User" WHERE "publicationId" = $1`, publicationID).Scan(&ownerID)
	if err == nil {
		return ownerID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	// Publication média → owner actif du média.
	err = s.pool.QueryRow(ctx,
		`SELECT mm."userId"::text
		 FROM "MediaMember" mm
		 JOIN "Media" md ON md.id = mm."mediaId"
		 WHERE md."publicationId" = $1 AND mm.role = 'owner' AND mm.status = 'active'
		 LIMIT 1`, publicationID).Scan(&ownerID)
	if err != nil {
		return "", err
	}
	return ownerID, nil
}

// UnlockArticleWithWallet débite le lecteur et crédite le propriétaire
// (parité wallet.unlockArticleWithWallet Prisma, transaction atomique).
func (s *Service) UnlockArticleWithWallet(ctx context.Context, readerID, publicationID string, costCents int) (string, error) {
	if costCents <= 0 {
		costCents = 200
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var balance int
	err = tx.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, readerID).Scan(&balance)
	if err != nil {
		return "USER_NOT_FOUND", err
	}
	if balance < costCents {
		return "INSUFFICIENT_FUNDS", nil
	}

	ownerID, err := s.getPublicationOwnerID(ctx, publicationID)
	if err != nil {
		return "PUBLICATION_NOT_FOUND", err
	}

	if _, err := tx.Exec(ctx,
		`UPDATE "User" SET "walletBalanceCents" = "walletBalanceCents" - $2, "updatedAt" = now() WHERE id = $1`,
		readerID, costCents); err != nil {
		return "TRANSACTION_FAILED", err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type)
		 VALUES (gen_random_uuid()::text, $1, $2, 'PAYWALL_UNLOCK')`,
		readerID, -costCents); err != nil {
		return "TRANSACTION_FAILED", err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE "User" SET "walletBalanceCents" = "walletBalanceCents" + $2, "updatedAt" = now() WHERE id = $1`,
		ownerID, costCents); err != nil {
		return "TRANSACTION_FAILED", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "TRANSACTION_FAILED", err
	}
	return "", nil
}

// isEmailConflict détecte la violation d'unicité sur User.email
// (SQLSTATE 23505, contrainte User_email_key).
func isEmailConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "User_email_key"
}
