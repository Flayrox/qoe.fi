// Package auditlog — écriture partagée du journal d'audit superadmin
// (AdminAuditLog), gated par le flag `admin-audit-log`.
//
// Utilisé par les modules admin (permissions API, contrôle d'accès),
// settings (clés API) et media (rôles/permissions des membres) : une seule
// source de vérité pour « qui, quand, quoi ». Best-effort — une erreur
// d'écriture est loggée, jamais propagée (le journal ne doit pas bloquer
// l'action qu'il trace).
package auditlog

import (
	"context"
	"encoding/json"
	"log"
	"reflect"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/flags"
)

// Inserter est la surface minimale d'écriture (db.Querier l'implémente).
type Inserter interface {
	InsertAdminAuditLog(ctx context.Context, arg db.InsertAdminAuditLogParams) error
}

// FlagChecker évalue un flag (le Service de internal/flags l'implémente).
type FlagChecker interface {
	IsOn(ctx context.Context, key string) bool
}

// isNilFlag détecte un flag non branché : une interface contenant un
// pointeur nil (ex: *flags.Service jamais assigné via SetFlags) n'est pas
// comparable à nil — la réflexion est le seul moyen fiable.
func isNilFlag(f FlagChecker) bool {
	if f == nil {
		return true
	}
	rv := reflect.ValueOf(f)
	switch rv.Kind() {
	case reflect.Ptr, reflect.Interface, reflect.Map, reflect.Slice, reflect.Func:
		return rv.IsNil()
	}
	return false
}

// Write trace une action sensible au journal d'audit superadmin quand le flag
// admin-audit-log est actif. targetID vide → NULL ; métadonnées sérialisées
// en JSONB (casté via texte, compatible QueryExecModeExec/PgBouncer).
func Write(ctx context.Context, q Inserter, f FlagChecker, actorID, action, targetType, targetID string, metadata any) {
	if isNilFlag(f) || !f.IsOn(ctx, flags.AdminAuditLog) {
		return
	}
	var actor pgtype.UUID
	if err := actor.Scan(actorID); err != nil {
		return
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return
	}
	tid := pgtype.Text{}
	if targetID != "" {
		tid = pgtype.Text{String: targetID, Valid: true}
	}
	if err := q.InsertAdminAuditLog(ctx, db.InsertAdminAuditLogParams{
		ActorId: actor, Action: action, TargetType: targetType,
		TargetId: tid, Column5: string(raw),
	}); err != nil {
		log.Printf("[admin-audit] %s: %v", action, err)
	}
}
