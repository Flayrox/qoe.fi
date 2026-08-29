package feed

import db "github.com/qoefi/api/internal/database"

// ServiceQuerier est le queryer du service feed : db.Querier déclaré abstrait
// pour que les tests puissent injecter des erreurs sur des méthodes précises
// (branches « return err » autrement inaccessibles) via un fake.
type ServiceQuerier = db.Querier