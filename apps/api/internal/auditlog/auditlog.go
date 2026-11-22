// Package auditlog — écriture partagée du journal d'audit superadmin
// (AdminAuditLog).
//
// Utilisé par les modules admin (permissions API, contrôle d'accès),
// settings (clés API) et media (rôles/permissions des membres) : une seule
// source de vérité pour « qui, quand, quoi ».
//
// L'écriture est TOUJOURS tentée : le flag `admin-audit-log` ne gouverne pas
// l'existence de la trace — une action sensible ne doit pas devenir invisible
// parce qu'un interrupteur est éteint (aucun paramètre de flag n'est donc
// nécessaire ici). Best-effort — une erreur est journalisée, jamais propagée
// (le journal ne doit pas bloquer l'action qu'il trace) — mais JAMAIS muette :
// une trace perdue doit pouvoir se constater dans les journaux du serveur.
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

// Write trace une action sensible au journal d'audit superadmin. targetID vide
// → NULL ; métadonnées sérialisées en JSONB (casté via texte, compatible
// QueryExecModeExec/PgBouncer).
//
// Aucun retour d'erreur : l'appelant ne doit jamais échouer parce que sa trace
// n'a pas pu être écrite. En contrepartie, chaque perte est journalisée — un
// acteur non-UUID (claims dégradés) ou des métadonnées non sérialisables
// laissaient auparavant la trace absente ET silencieuse.
func Write(ctx context.Context, q Inserter, actorID, action, targetType, targetID string, metadata any) {
	var actor pgtype.UUID
	if err := actor.Scan(actorID); err != nil {
		log.Printf("[admin-audit] %s: acteur %q inexploitable, trace non écrite: %v", action, actorID, err)
		return
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		log.Printf("[admin-audit] %s: métadonnées non sérialisables, trace non écrite: %v", action, err)
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
