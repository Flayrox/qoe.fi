'use client';

import { Globe, Loader2, Lock, Pencil, Trash2 } from 'lucide-react';

import { SafeAvatar } from '../../SafeAvatar';
import { ProfileHoverCard } from '../../social/ProfileHoverCard';
import { Button } from '../../primitives/button/button';
import { ToggleButton } from '../../primitives/toggle/toggle-button';
import type { AnnotationItem } from '../types';
import { t } from '@lingui/core/macro';

/**
 * Rangée d'identité : qui a écrit, quand, et ce que son propriétaire peut
 * faire.
 *
 * Hauteur fixe et actions ancrées à droite : la bascule de visibilité
 * disparaît sur une annotation officielle, mais les boutons modifier et
 * supprimer ne glissent pas pour autant. La ligne de métadonnées tient sur
 * une seule ligne (tronquée) pour que la citation garde sa place.
 */
export function AnnotationDrawerIdentity({
  annotation,
  authorName,
  isOfficial,
  isOwner,
  canDelete,
  hasNote,
  isPublicState,
  togglingPrivacy,
  allowPublicAnnotations,
  confirmingDelete,
  onStartWritingNote,
  onRequestDelete,
  onTogglePrivacy,
  onOpenProfile,
}: {
  annotation: AnnotationItem;
  authorName: string;
  isOfficial: boolean;
  isOwner: boolean;
  canDelete: boolean;
  hasNote: boolean;
  isPublicState: boolean;
  togglingPrivacy: boolean;
  allowPublicAnnotations: boolean;
  confirmingDelete: boolean;
  onStartWritingNote: () => void;
  onRequestDelete: () => void;
  onTogglePrivacy: () => void;
  onOpenProfile?: (handle: string) => void;
}) {
  const createdAt = new Date(annotation.createdAt);
  const updatedAt = annotation.updatedAt ? new Date(annotation.updatedAt) : null;
  const isEdited = Boolean(updatedAt && updatedAt.getTime() - createdAt.getTime() > 3000);
  const formattedEditTime = isEdited
    ? updatedAt?.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      data-annotation-identity
      className="flex h-[4.5rem] shrink-0 items-center justify-between gap-3 px-4"
    >
      <div className="flex min-w-0 flex-col">
        {/* L'identité entière (avatar + nom) est la cible du survol :
            `type` est transmis pour qu'un compte média garde son carré à
            bords arrondis, jamais un cercle. `SafeAvatar` gère aussi le
            repli quand l'URL casse. */}
        <ProfileHoverCard
          user={{
            id: annotation.reader.id,
            name: authorName,
            username: annotation.reader.username,
            subdomain: annotation.reader.subdomain,
            logoUrl: annotation.reader.logoUrl,
            type: annotation.reader.type,
          }}
          username={annotation.reader.username ?? undefined}
          onOpenProfile={onOpenProfile}
          className="flex min-w-0 items-center gap-2.5"
        >
          <SafeAvatar
            id={annotation.reader.id}
            src={annotation.reader.logoUrl}
            name={authorName}
            username={annotation.reader.username}
            type={annotation.reader.type}
            size={32}
            className="border border-border/40"
          />
          <span className="flex min-w-0 items-center gap-1.5 type-control-md font-semibold text-foreground">
            <span className="truncate">{authorName}</span>
            {isOfficial && (
              <span className="shrink-0 rounded-tag bg-highlight/20 px-1.5 py-0.5 type-control-xs font-medium text-foreground">
                {t`Auteur`}
              </span>
            )}
          </span>
        </ProfileHoverCard>

        <div className="mt-0.5 flex items-center gap-1.5 pl-[42px] type-control-xs text-muted-foreground">
          <span className="shrink-0">
            {createdAt.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
          </span>
          {isEdited && formattedEditTime && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate" title={t`Édité le ${formattedEditTime}`}>
                {t`Modifié le`} {formattedEditTime}
              </span>
            </>
          )}
        </div>
      </div>

      <div data-annotation-actions className="flex shrink-0 items-center gap-0.5">
        {isOwner && !isOfficial && (
          <ToggleButton
            size="xs"
            isSelected={isPublicState}
            isDisabled={togglingPrivacy || (!allowPublicAnnotations && !isPublicState)}
            onChange={onTogglePrivacy}
            className="mr-1 min-w-[5.25rem] justify-center"
          >
            {togglingPrivacy ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : isPublicState ? (
              <Globe aria-hidden />
            ) : (
              <Lock aria-hidden />
            )}
            <span>{isPublicState ? t`Publique` : t`Privée`}</span>
          </ToggleButton>
        )}

        {isOwner && hasNote && (
          <Button
            size="xs"
            shape="icon"
            variant="ghost"
            onClick={onStartWritingNote}
            aria-label={t`Modifier cette annotation`}
            title={t`Modifier cette annotation`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil />
          </Button>
        )}

        {canDelete && (
          <Button
            size="xs"
            shape="icon"
            variant="ghost"
            tone="danger"
            onClick={onRequestDelete}
            aria-label={hasNote ? t`Supprimer cette annotation` : t`Supprimer ce surlignage`}
            aria-expanded={confirmingDelete}
            title={hasNote ? t`Supprimer cette annotation` : t`Supprimer ce surlignage`}
            className="hover:text-destructive-text"
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}
