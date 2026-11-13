package shortcode

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsUniqueViolation(t *testing.T) {
	if !IsUniqueViolation(&pgconn.PgError{Code: "23505"}) {
		t.Fatal("SQLSTATE 23505 doit être reconnu comme collision d'unicité")
	}
	if IsUniqueViolation(&pgconn.PgError{Code: "23503"}) {
		t.Fatal("23503 (violation de clé étrangère) ne doit pas être pris pour un code court déjà pris")
	}
	if IsUniqueViolation(errors.New("boom")) {
		t.Fatal("une erreur non pgx ne doit pas être reconnue")
	}
	if IsUniqueViolation(nil) {
		t.Fatal("nil ne doit pas être reconnu")
	}
}
