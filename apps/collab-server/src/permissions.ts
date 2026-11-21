// =====================================================================
// 🛡️ Permissions — Qui peut co-éditer un article ?
// =====================================================================
// Parité avec l'API Go (`apps/api/internal/permissions/media.go` et
// `apps/api/internal/modules/articles/service.go`) :
//   - Sur espace PERSONNEL : l'auteur principal ou un co-auteur invité
//     (`ArticleAttribution` ou `CollaborationRequest` acceptée).
//   - Sur espace MÉDIA : les membres ACTIFS ayant `media:edit:any` (owner/editor)
//     ou `media:edit_own` sur leur propre article (writer) — avec respect des
//     overrides granulaires (`"perm"` / `"-perm"`). Un viewer ou un auteur exclu
//     ne peut pas modifier l'archive du média.
//   - Co-auteurs externes : `ArticleAttribution` (non `PRIMARY_AUTHOR`) ou
//     `CollaborationRequest` avec `status = 'ACCEPTED'`.
// =====================================================================

import type { Pool } from 'pg';

export type DocumentAccessChecker = (userId: string, documentName: string) => Promise<boolean>;

export interface MediaMember {
  role: string;
  permissions?: string[] | null;
  status?: string | null;
}

export interface ArticleEditAccessRow {
  publisherType: string | null;
  authorId: string;
  memberRole: string | null;
  memberPermissions: string[] | null;
  memberStatus: string | null;
  hasAttribution: boolean | string | number;
  hasAcceptedCollab: boolean | string | number;
}

const PERM_EDIT_ANY = 'media:edit:any';
const PERM_EDIT_OWN = 'media:edit_own';

const ROLE_BASE_EDIT_PERMISSIONS: Record<string, readonly string[]> = {
  owner: [PERM_EDIT_ANY, PERM_EDIT_OWN],
  editor: [PERM_EDIT_ANY, PERM_EDIT_OWN],
  writer: [PERM_EDIT_OWN],
  viewer: [],
};

/**
 * Parité Go (`permissions.CanEditMediaArticle`) : applique le rôle de base
 * puis les overrides dans l'ordre (le dernier gagne), en exigeant un statut
 * actif (ou vide pour compatibilité).
 */
export function canEditMediaArticle(
  member: MediaMember | null | undefined,
  articleAuthorId: string,
  memberUserId: string
): boolean {
  if (!member) return false;
  if (member.status && member.status !== 'active') return false;

  const active = new Set<string>(ROLE_BASE_EDIT_PERMISSIONS[member.role] ?? []);
  for (const override of member.permissions ?? []) {
    if (!override) continue;
    if (override.startsWith('-')) {
      active.delete(override.slice(1));
    } else {
      active.add(override);
    }
  }

  if (active.has(PERM_EDIT_ANY)) return true;
  if (active.has(PERM_EDIT_OWN) && articleAuthorId === memberUserId) return true;
  return false;
}

function asBool(value: unknown): boolean {
  return value === true || value === 't' || value === 1;
}

export function evaluateArticleEditAccess(
  row: ArticleEditAccessRow | undefined,
  userId: string
): boolean {
  if (!row || !userId) return false;

  const hasAttribution = asBool(row.hasAttribution);
  const hasAcceptedCollab = asBool(row.hasAcceptedCollab);

  if (row.publisherType === 'PERSONAL') {
    return row.authorId === userId || hasAttribution || hasAcceptedCollab;
  }

  if (row.publisherType === 'MEDIA') {
    if (row.memberRole) {
      return canEditMediaArticle(
        {
          role: row.memberRole,
          permissions: row.memberPermissions,
          status: row.memberStatus,
        },
        row.authorId,
        userId
      );
    }
    return hasAttribution || hasAcceptedCollab;
  }

  return false;
}

const CAN_EDIT_SQL = `
  SELECT
    p.type::text AS "publisherType",
    a."authorId"::text AS "authorId",
    mm.role AS "memberRole",
    mm.permissions AS "memberPermissions",
    mm.status AS "memberStatus",
    EXISTS (
      SELECT 1 FROM "ArticleAttribution" aa
      WHERE aa."articleId" = a.id
        AND aa."userId" = $1
        AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
        AND (p.type = 'PERSONAL' OR aa.role <> 'PRIMARY_AUTHOR')
    ) AS "hasAttribution",
    EXISTS (
      SELECT 1 FROM "CollaborationRequest" cr
      WHERE cr."articleId" = a.id
        AND cr."inviteeId" = $1
        AND cr.status = 'ACCEPTED'
    ) AS "hasAcceptedCollab"
  FROM "Article" a
  LEFT JOIN "Publisher" p ON p.id = a."publisherId"
  LEFT JOIN "Media" m ON m."publisherId" = p.id
  LEFT JOIN "MediaMember" mm
    ON mm."mediaId" = m.id AND mm."userId" = $1 AND mm."status" = 'active'
  WHERE a.id = $2
`;

/**
 * Fabrique un contrôleur d'accès basé sur la base Postgres.
 * `documentName` attendu au format `article:{id}`.
 */
export function createPublisherAccessChecker(pool: Pool): DocumentAccessChecker {
  return async (userId: string, documentName: string): Promise<boolean> => {
    const articleId = parseArticleId(documentName);
    if (!articleId) return false;

    const result = await pool.query<ArticleEditAccessRow>(CAN_EDIT_SQL, [userId, articleId]);
    return evaluateArticleEditAccess(result.rows[0], userId);
  };
}

const ARTICLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Extrait l'id d'article d'un nom de document Yjs (`article:{id}`). */
export function parseArticleId(documentName: string): string | null {
  const prefix = 'article:';
  if (!documentName.startsWith(prefix)) return null;
  const id = documentName.slice(prefix.length);
  return ARTICLE_ID_PATTERN.test(id) ? id : null;
}
