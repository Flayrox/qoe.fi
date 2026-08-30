package users

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

type Session struct {
	ID         string   `json:"id"`
	ClientID   string   `json:"clientId"`
	Scopes     []string `json:"scopes"`
	CreatedAt  string   `json:"createdAt"`
	ExpiresAt  string   `json:"expiresAt"`
	LastUsedAt *string  `json:"lastUsedAt,omitempty"`
	Current    bool     `json:"current"`
}

func (s *Service) Sessions(ctx context.Context, userID, currentToken string) ([]Session, error) {
	rows, err := s.pool.Query(ctx, `SELECT t.id, c."clientId", t.scopes, t."createdAt", t."accessTokenExpiresAt", t."lastUsedAt", t."accessTokenHash" FROM "OAuthToken" t JOIN "OAuthClient" c ON c.id=t."clientId" WHERE t."userId"=$1 AND t."revokedAt" IS NULL ORDER BY t."createdAt" DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	current := ""
	if currentToken != "" {
		sum := sha256.Sum256([]byte(currentToken))
		current = hex.EncodeToString(sum[:])
	}
	out := []Session{}
	for rows.Next() {
		var x Session
		var created, expires, last pgtype.Timestamp
		var hash string
		if err := rows.Scan(&x.ID, &x.ClientID, &x.Scopes, &created, &expires, &last, &hash); err != nil {
			return nil, err
		}
		x.CreatedAt, x.ExpiresAt = created.Time.UTC().Format(time.RFC3339), expires.Time.UTC().Format(time.RFC3339)
		if last.Valid {
			v := last.Time.UTC().Format(time.RFC3339)
			x.LastUsedAt = &v
		}
		x.Current = hash == current
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *Service) RevokeSession(ctx context.Context, userID, id string) error {
	res, err := s.pool.Exec(ctx, `UPDATE "OAuthToken" SET "revokedAt"=now() WHERE id=$1 AND "userId"=$2 AND "revokedAt" IS NULL`, id, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return errors.New("session introuvable")
	}
	return nil
}

func (s *Service) RevokeAllSessions(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `UPDATE "OAuthToken" SET "revokedAt"=now() WHERE "userId"=$1 AND "revokedAt" IS NULL`, userID)
	return err
}

func (s *Service) RevokeOtherSessions(ctx context.Context, userID, currentToken string) error {
	if currentToken == "" {
		return errors.New("session courante requise")
	}
	h := sha256.Sum256([]byte(currentToken))
	_, err := s.pool.Exec(ctx, `UPDATE "OAuthToken" SET "revokedAt"=now() WHERE "userId"=$1 AND "accessTokenHash"<>$2 AND "revokedAt" IS NULL`, userID, hex.EncodeToString(h[:]))
	return err
}
