package home

import "github.com/jackc/pgx/v5/pgtype"

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}
