'use client';

import React, { useState } from 'react';
import { EyeOff, Eye, ShieldAlert, Loader2 } from 'lucide-react';
import { hideReplyAction } from '@qoe/api-client';
import { t } from '@lingui/core/macro';

export interface HiddenReplyCardProps {
  replyId: string;
  isHiddenByAuthor: boolean;
  isParentAuthor?: boolean;
  children: React.ReactNode;
}

export function HiddenReplyCard({
  replyId,
  isHiddenByAuthor: initialHidden,
  isParentAuthor = false,
  children,
}: HiddenReplyCardProps) {
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
      }
    } catch (err) {
      console.error('Error toggling reply visibility:', err);
    } finally {
      setIsToggling(false);
    }
  };

  if (!isHidden) {
    return (
      <div className="relative group">
        {children}
        {isParentAuthor && (
          <button
            onClick={handleToggleHide}
            disabled={isToggling}
            title="Masquer cette réponse pour tous les lecteurs"
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 p-1.5 rounded-full bg-muted/80 hover:bg-destructive/10 hover:text-destructive text-muted-foreground text-xs font-medium flex items-center gap-1"
          >
            {isToggling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md p-4 space-y-3 font-sans my-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="w-4 h-4 text-highlight shrink-0" />
          <span>{t`Réponse masquée par l'auteur original`}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowContentAnyway(!showContentAnyway)}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            {showContentAnyway ? (
              <>
                <EyeOff className="w-3 h-3" />
                <span>Masquer</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" />
                <span>Afficher</span>
              </>
            )}
          </button>

          {isParentAuthor && (
            <button
              onClick={handleToggleHide}
              disabled={isToggling}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground underline flex items-center gap-1 ml-2"
            >
              {isToggling ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Démasquer</span>}
            </button>
          )}
        </div>
      </div>

      {showContentAnyway && (
        <div className="pt-2 border-t border-border/40 opacity-80">{children}</div>
      )}
    </div>
  );
}
