'use client';

import React, { useState } from 'react';
import { hideReplyAction } from '@qoe/sdk';
import { Button } from '@qoe/ui/button';
import { Icon } from '@qoe/ui/icons';
import { IconButton } from '@qoe/ui/icon-button';
import { Spinner } from '@qoe/ui/spinner';
import { toast } from '@qoe/ui/toast';
import { t } from '@lingui/core/macro';

export interface HiddenReplyNoticeProps {
  replyId: string;
  isHiddenByAuthor: boolean;
  isParentAuthor?: boolean;
  children: React.ReactNode;
}

/**
 * Notice de réponse masquée : ce n'est pas une primitive `Card`, mais un état
 * de modération posé dans le fil (d'où le nom, qui ne revendique pas d'être
 * un composant de base).
 */
export function HiddenReplyNotice({
  replyId,
  isHiddenByAuthor: initialHidden,
  isParentAuthor = false,
  children,
}: HiddenReplyNoticeProps) {
  const [isHidden, setIsHidden] = useState(initialHidden);
  const [showContentAnyway, setShowContentAnyway] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleHide = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isToggling) return;
    setIsToggling(true);

    try {
      const res = await hideReplyAction({ replyId });
      if (res.ok) {
        setIsHidden(res.data.isHiddenByAuthor);
      } else {
        // Rien ne change à l'écran : sans message, l'auteur croit avoir masqué.
        toast.error(
          typeof res.error === 'string'
            ? res.error
            : res.error?.message || t`Impossible de modifier la visibilité de cette réponse.`
        );
      }
    } catch {
      toast.error(t`Erreur réseau : la visibilité de la réponse n'a pas changé.`);
    } finally {
      setIsToggling(false);
    }
  };

  if (!isHidden) {
    return (
      <div className="relative group">
        {children}
        {isParentAuthor && (
          <IconButton
            label={t`Masquer cette réponse pour tous les lecteurs`}
            size="xs"
            onClick={handleToggleHide}
            disabled={isToggling}
            className="absolute top-2 right-2 rounded-full bg-muted/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive-text focus:opacity-100"
          >
            {isToggling ? <Spinner size="xs" /> : <Icon name="eye-off" />}
          </IconButton>
        )}
      </div>
    );
  }

  return (
    <div className="my-2 space-y-3 rounded-panel border border-border/60 bg-card/40 p-4 font-sans backdrop-blur-md">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="shield" size="sm" className="shrink-0 text-highlight" />
          <span>{t`Réponse masquée par l'auteur original`}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowContentAnyway(!showContentAnyway)}
            className="text-primary"
          >
            <Icon name={showContentAnyway ? 'eye-off' : 'eye'} size="sm" />
            {showContentAnyway ? t`Masquer` : t`Afficher`}
          </Button>

          {isParentAuthor && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleToggleHide}
              disabled={isToggling}
              className="ml-2 text-muted-foreground underline"
            >
              {isToggling ? <Spinner size="xs" /> : null}
              {t`Démasquer`}
            </Button>
          )}
        </div>
      </div>

      {showContentAnyway && (
        <div className="border-t border-border/40 pt-2 opacity-80">{children}</div>
      )}
    </div>
  );
}
