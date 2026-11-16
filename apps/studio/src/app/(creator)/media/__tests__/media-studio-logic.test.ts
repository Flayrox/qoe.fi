// =====================================================================
// 🧪 media-studio-logic — règles du studio Média sans DOM
// =====================================================================
// Le journal d'audit est la seule trace de ce qui s'est passé dans un Média :
// chaque action doit se lire sans ambiguïté, avec son détail quand il existe.
// On vérifie aussi les permissions effectives et les statuts de liens.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { ALL_MEDIA_PERMISSIONS } from '@qoe/auth/media';

import {
  ASSIGNABLE_ROLES,
  ROLE_DEFAULT_PERMS,
  describeAuditEntry,
  effectivePermissions,
  formatMediaDate,
  formatMediaDateTime,
  inviteLinkStatus,
  togglePermission,
} from '../media-studio-logic';

const entry = (action: string, metadata: Record<string, unknown> | null = null) => ({
  action,
  metadata,
});

describe('describeAuditEntry', () => {
  it('décrit la création du Média', () => {
    expect(describeAuditEntry(entry('media.created'))).toEqual({
      summary: 'a créé le Média',
    });
  });

  it('liste les champs modifiés en français', () => {
    expect(
      describeAuditEntry(entry('media.settings_updated', { fields: ['name', 'seoTitle', 'bio'] }))
    ).toEqual({
      summary: 'a modifié les réglages du Média',
      detail: 'nom, titre SEO, bio',
    });
  });

  it('garde le nom technique d’un champ inconnu', () => {
    expect(
      describeAuditEntry(entry('media.settings_updated', { fields: ['unknownField'] })).detail
    ).toBe('unknownField');
  });

  it('n’ajoute pas de détail quand aucun champ n’est modifié', () => {
    expect(
      describeAuditEntry(entry('media.settings_updated', { fields: [] })).detail
    ).toBeUndefined();
    expect(describeAuditEntry(entry('media.settings_updated', null)).detail).toBeUndefined();
  });

  it('ignore un `fields` qui n’est pas un tableau', () => {
    expect(
      describeAuditEntry(entry('media.settings_updated', { fields: 'name' })).detail
    ).toBeUndefined();
  });

  it('cite le titre de l’article pour chaque action éditoriale', () => {
    const title = { title: 'La ville breathe' };

    expect(describeAuditEntry(entry('media.article_created', title)).summary).toBe(
      "a créé l'article « La ville breathe »"
    );
    expect(describeAuditEntry(entry('media.article_published', title)).summary).toBe(
      "a publié l'article « La ville breathe »"
    );
    expect(describeAuditEntry(entry('media.article_unpublished', title)).summary).toBe(
      "a dépublié l'article « La ville breathe »"
    );
    expect(describeAuditEntry(entry('media.article_deleted', title)).summary).toBe(
      "a supprimé l'article « La ville breathe »"
    );
    expect(describeAuditEntry(entry('media.article_draft_discarded', title)).summary).toBe(
      'a abandonné le brouillon de « La ville breathe »'
    );
    expect(describeAuditEntry(entry('media.article_schedule_cancelled', title)).summary).toBe(
      "a annulé la programmation de l'article « La ville breathe »"
    );
  });

  it('ajoute les champs modifiés à une mise à jour d’article', () => {
    expect(
      describeAuditEntry(entry('media.article_updated', { title: 'T', fields: ['content'] }))
    ).toEqual({ summary: "a modifié l'article « T »", detail: 'contenu' });
  });

  it('date la programmation quand elle est connue', () => {
    const iso = '2026-12-24T18:30:00.000Z';
    const result = describeAuditEntry(
      entry('media.article_scheduled', { title: 'T', scheduledAt: iso })
    );

    expect(result.summary).toBe("a programmé l'article « T »");
    expect(result.detail).toBe(formatMediaDateTime(iso));
  });

  it('omet la date de programmation illisible', () => {
    expect(
      describeAuditEntry(entry('media.article_scheduled', { title: 'T', scheduledAt: 42 })).detail
    ).toBeUndefined();
  });

  it('reprend le commentaire d’approbation ou de refus', () => {
    expect(
      describeAuditEntry(entry('media.article_approved', { title: 'T', comment: 'Très bon' }))
    ).toEqual({ summary: "a approuvé l'article « T »", detail: 'Très bon' });
    expect(
      describeAuditEntry(entry('media.article_rejected', { title: 'T', comment: '' })).detail
    ).toBeUndefined();
  });

  it('nomme la publication de destination ou d’origine d’un transfert', () => {
    expect(
      describeAuditEntry(
        entry('media.article_transferred_out', { title: 'T', toPublisherName: 'La Revue' })
      )
    ).toEqual({ summary: "a transféré l'article « T »", detail: 'vers La Revue' });

    expect(
      describeAuditEntry(
        entry('media.article_transferred_in', { title: 'T', fromPublisherName: 'Le Quotidien' })
      )
    ).toEqual({ summary: "a reçu l'article « T »", detail: 'depuis Le Quotidien' });
  });

  it('décrit les mouvements d’équipe', () => {
    expect(describeAuditEntry(entry('member.role_changed', { role: 'editor' }))).toEqual({
      summary: "a changé le rôle d'un membre",
      detail: 'editor',
    });
    expect(describeAuditEntry(entry('member.invited_pending', { username: 'ada' })).summary).toBe(
      'a invité @ada'
    );
    expect(describeAuditEntry(entry('member.invitation_accepted', { role: 'writer' }))).toEqual({
      summary: 'a rejoint le Média',
      detail: 'writer',
    });
    expect(describeAuditEntry(entry('member.removed')).summary).toBe('a retiré un membre du Média');
  });

  it('décrit les liens d’invitation et les clés API', () => {
    expect(describeAuditEntry(entry('media.invite_link_created')).summary).toBe(
      "a généré un lien d'invitation"
    );
    expect(describeAuditEntry(entry('media.invite_link_revoked')).summary).toBe(
      "a révoqué un lien d'invitation"
    );
    expect(describeAuditEntry(entry('api_key.created')).summary).toBe('a créé une clé API');
    expect(describeAuditEntry(entry('api_key.rotated')).summary).toBe('a régénéré une clé API');
  });

  it('retombe sur l’action brute pour un événement inconnu', () => {
    expect(describeAuditEntry(entry('media.future_event'))).toEqual({
      summary: 'media.future_event',
    });
  });
});

describe('inviteLinkStatus', () => {
  const base = { isRevoked: false, expiresAt: null, maxUses: 0, usedCount: 0 };
  const now = new Date('2026-11-16T12:00:00.000Z').getTime();

  it('considère un lien sans limite comme actif', () => {
    expect(inviteLinkStatus(base, now)).toEqual({ label: 'Actif', tone: 'success' });
  });

  it('priorise la révocation sur l’expiration', () => {
    expect(
      inviteLinkStatus(
        {
          ...base,
          isRevoked: true,
          expiresAt: '2026-01-01T00:00:00.000Z',
          maxUses: 1,
          usedCount: 1,
        },
        now
      )
    ).toEqual({ label: 'Révoqué', tone: 'danger' });
  });

  it('signale un lien expiré', () => {
    expect(inviteLinkStatus({ ...base, expiresAt: '2026-11-01T00:00:00.000Z' }, now)).toEqual({
      label: 'Expiré',
      tone: 'neutral',
    });
  });

  it('signale un lien épuisé', () => {
    expect(inviteLinkStatus({ ...base, maxUses: 2, usedCount: 2 }, now)).toEqual({
      label: 'Épuisé',
      tone: 'neutral',
    });
  });

  it('laisse actif un lien partiellement utilisé avant expiration', () => {
    expect(
      inviteLinkStatus(
        { ...base, maxUses: 5, usedCount: 2, expiresAt: '2027-01-01T00:00:00.000Z' },
        now
      )
    ).toEqual({ label: 'Actif', tone: 'success' });
  });
});

describe('permissions', () => {
  it('applique les permissions par défaut du rôle', () => {
    expect(effectivePermissions({ role: 'writer' })).toEqual(ROLE_DEFAULT_PERMS.writer);
    expect(effectivePermissions({ role: 'viewer', permissions: [] })).toEqual(
      ROLE_DEFAULT_PERMS.viewer
    );
  });

  it('privilégie les permissions explicites du membre', () => {
    expect(effectivePermissions({ role: 'writer', permissions: ['media:review'] })).toEqual([
      'media:review',
    ]);
  });

  it('ne renvoie rien pour un rôle inconnu sans override', () => {
    expect(effectivePermissions({ role: 'ghost' })).toEqual([]);
  });

  it('donne toutes les permissions au propriétaire', () => {
    expect(ROLE_DEFAULT_PERMS.owner).toEqual(ALL_MEDIA_PERMISSIONS);
    expect(ASSIGNABLE_ROLES).toEqual(['editor', 'writer', 'viewer']);
  });

  it('ajoute une permission absente', () => {
    expect(togglePermission({ role: 'writer' }, 'media:review').sort()).toEqual(
      ['media:create_articles', 'media:edit_own', 'media:review'].sort()
    );
  });

  it('retire une permission déjà accordée', () => {
    expect(togglePermission({ role: 'writer' }, 'media:edit_own')).toEqual([
      'media:create_articles',
    ]);
  });
});

describe('formatMediaDate', () => {
  it('affiche un tiret sans date', () => {
    expect(formatMediaDate(null)).toBe('—');
  });

  it('formate une date lisible en français', () => {
    expect(formatMediaDate('2026-03-05T10:00:00.000Z')).toMatch(/5 mars 2026/);
  });
});
