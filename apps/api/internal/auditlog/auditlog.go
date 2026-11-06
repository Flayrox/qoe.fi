// Package auditlog — écriture partagée du journal d'audit superadmin
// (AdminAuditLog).
//
// Utilisé par les modules admin (permissions API, contrôle d'accès),
// settings (clés API) et media (rôles/permissions des membres) : une seule
// source de vérité pour « qui, quand, quoi ».
//
// L'écriture est TOUJOURS tentée. Le flag `admin-audit-log` ne gouverne plus
// l'existence de la trace : une action sensible ne doit pas devenir invisible
// parce qu'un interrupteur est éteint. Le paramètre FlagChecker est conservé
// pour le futur mode verbeux (métadonnées détaillées), jamais pour supprimer
// la ligne. Best-effort — une erreur d'écriture est loggée, jamais propagée
// (le journal ne doit pas bloquer l'action qu'il trace).
package auditlog

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// Inserter est la surface minimale d'écriture (db.Querier l'implémente).
type Inserter interface {
	InsertAdminAuditLog(ctx context.Context, arg db.InsertAdminAuditLogParams) error
}

// FlagChecker évalue un flag (le Service de internal/flags l'implémente).
// Conservé dans la signature pour le mode verbeux ; il ne conditionne plus
// l'écriture de la trace.
type FlagChecker interface {
	IsOn(ctx context.Context, key string) bool
}

// Write trace une action sensible au journal d'audit superadmin. targetID vide
// → NULL ; métadonnées sérialisées en JSONB (casté via texte, compatible
// QueryExecModeExec/PgBouncer).
func Write(ctx context.Context, q Inserter, _ FlagChecker, actorID, action, targetType, targetID string, metadata any) {
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
