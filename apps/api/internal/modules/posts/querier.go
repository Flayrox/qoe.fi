package posts

import (
	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
)

// ServiceQuerier est le queryer du service posts : il étend le Querier généré
// par sqlc avec un WithTx transactionnel qui retourne un ServiceQuerier. Le
// champ est déclaré abstrait pour permettre aux tests d'injecter des erreurs
// sur des méthodes précises (branches « return err » autrement inaccessibles)
// via un fake qui propage aussi ses fautes dans la branche transactionnelle.
type ServiceQuerier interface {
	db.Querier
	WithTx(tx pgx.Tx) ServiceQuerier
}

var _ ServiceQuerier = (*realQueryer)(nil)

// realQueryer est l'implémentation de production : un *db.Queries dont le
// WithTx renvoie un realQueryer sur la transaction.
type realQueryer struct {
	*db.Queries
}

func (r *realQueryer) WithTx(tx pgx.Tx) ServiceQuerier {
	return &realQueryer{Queries: db.New(tx)}
}