// =====================================================================
// 🛡️ Permissions — Qui peut co-éditer un article ?
// =====================================================================
// Vérifie que l'utilisateur a le droit d'éditer l'article associé au
// document Yjs (`article:{id}`). Peuvent éditer :
//   - l'auteur principal de l'article (`Article.authorId`) ;
//   - les co-auteurs (table de relation `_CoAuthors`) ;
//   - les membres ACTIFS du média propriétaire de la publication
//     (`MediaMember.status = 'active'`, tous rôles owner/editor/writer).
// Les lecteurs / invités / membres "left" sont refusés.
// =====================================================================

import type { Pool } from 'pg';

export type DocumentAccessChecker = (userId: string, documentName: string) => Promise<boolean>;

const CAN_EDIT_SQL = `
  SELECT EXISTS (
    SELECT 1
    FROM "Article" a
    LEFT JOIN "Publication" p ON p.id = a."publicationId"
    LEFT JOIN "Media" m ON m."publicationId" = p.id
    LEFT JOIN "MediaMember" mm
      ON mm."mediaId" = m.id AND mm."userId" = $1 AND mm."status" = 'active'
    WHERE a.id = $2
      AND (
        a."authorId" = $1
        OR EXISTS (SELECT 1 FROM "_CoAuthors" ca WHERE ca."A" = a.id AND ca."B" = $1)
        OR mm.id IS NOT NULL
      )
  ) AS "allowed"
`;

/**
 * Fabrique un contrôleur d'accès basé sur la base Postgres.
 * `documentName` attendu au format `article:{id}`.
 */
export function createPublicationAccessChecker(pool: Pool): DocumentAccessChecker {
  return async (userId: string, documentName: string): Promise<boolean> => {
    const articleId = parseArticleId(documentName);
    if (!articleId) return false;

    const result = await pool.query(CAN_EDIT_SQL, [userId, articleId]);
    const row = result.rows[0];
    return row?.allowed === true || row?.allowed === 't' || row?.allowed === 1;
  };
}

/** Extrait l'id d'article d'un nom de document Yjs (`article:{id}`). */
export function parseArticleId(documentName: string): string | null {
  const prefix = 'article:';
  if (!documentName.startsWith(prefix)) return null;
  const id = documentName.slice(prefix.length).trim();
  return id.length > 0 ? id : null;
}
