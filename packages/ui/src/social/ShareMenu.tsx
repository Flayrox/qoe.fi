'use client';

import React, { useState } from 'react';
import { MessageCircle, Link as LinkIcon, Share2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@qoe/utils';

export interface ShareMenuProps {
  url?: string;
  title?: string;
  text?: string;
  type?: 'post' | 'article';
  authorHandle?: string;
  id?: string;
  onSendViaChat?: () => void;
  onShare?: (e: React.MouseEvent) => void;
  trigger?: React.ReactElement;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function ShareMenu({
  url,
  title,
  text,
  type = 'post',
  authorHandle,
  id,
  onSendViaChat,
  onShare,
  trigger,
  align = 'end',
  side = 'top',
  className,
}: ShareMenuProps) {
  const [open, setOpen] = useState(false);

  const resolveUrl = () => {
    if (url) return url;
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    if (type === 'article') {
      return id ? `${origin}/article/${id}` : window.location.href;
    }
    const handle = authorHandle || 'auteur';
    return id ? `${origin}/thought/${handle}/${id}` : window.location.href;
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);

    if (onShare) {
      onShare(e);
      return;
    }

    const shareUrl = resolveUrl();
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Lien copié dans le presse-papier !');
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast.success('Lien copié dans le presse-papier !');
      }
    } catch {
      toast.error('Impossible de copier le lien.');
    }
  };

  const handleSendViaChat = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);

    if (onSendViaChat) {
      onSendViaChat();
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('open-chat-share', {
          detail: {
            type,
            id,
            url: resolveUrl(),
            title,
          },
        })
      );
      toast.info('Messagerie privée bientôt disponible !');
    }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);

    const shareUrl = resolveUrl();
    const shareData = {
      title: title || (type === 'article' ? 'Article sur Qoe' : 'Pensée sur Qoe'),
      text: text || '',
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err: unknown) {
        // Ignorer l'annulation par l'utilisateur (AbortError)
        if ((err as Error)?.name !== 'AbortError') {
          handleCopyLink(e);
        }
      }
    } else {
      // Fallback copie
      handleCopyLink(e);
    }
  };

  const defaultTrigger = (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none group/share',
        className
      )}
      title="Partager"
      aria-label="Partager"
    >
      <Share2 className="w-4 h-4 transition-transform group-hover/share:scale-110" />
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger || defaultTrigger} />
      <PopoverContent
        align={align}
        side={side}
        className="w-56 p-1.5 bg-popover/95 backdrop-blur-xl border border-border/40 shadow-2xl rounded-2xl font-sans z-50"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleSendViaChat}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/80 rounded-xl transition-colors cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 text-foreground shrink-0" />
          <span>Send via Chat</span>
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/80 rounded-xl transition-colors cursor-pointer"
        >
          <LinkIcon className="w-4 h-4 text-foreground shrink-0" />
          <span>Copy link</span>
        </button>

        <button
          type="button"
          onClick={handleNativeShare}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/80 rounded-xl transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4 text-foreground shrink-0" />
          <span>{type === 'article' ? 'Share article via ...' : 'Share post via ...'}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
