'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { Eye, Lock, Monitor, Smartphone, Tablet } from 'lucide-react';
import { t } from '@lingui/core/macro';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Button } from '@qoe/ui/button';
import { cn } from '@qoe/utils';
import { countWordsInHtml } from '../lib/preflight';

export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

export interface ReaderPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  editor: Editor;
  title: string;
  imageUrl?: string | null;
  coverAlt?: string;
  coverDecorative?: boolean;
  isPremium?: boolean;
}

const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: 'max-w-[880px]',
  tablet: 'max-w-[640px]',
  mobile: 'max-w-[390px]',
};

const PAYWALL_DIVIDER = /<div[^>]*data-type=["']paywall-divider["'][^>]*>\s*<\/div>/i;

function splitAtPaywall(html: string): { before: string; after: string } {
  const match = html.match(PAYWALL_DIVIDER);
  if (!match || match.index === undefined) return { before: html, after: '' };
  return {
    before: html.slice(0, match.index),
    after: html.slice(match.index + match[0].length),
  };
}

/**
 * Aperçu du rendu lecteur sans quitter l'éditeur. Ce n'est pas la page
 * publique : les annotations, commentaires et personnalisations du tenant ne
 * sont pas rejoués. La limite Premium est matérialisée pour vérifier l'extrait.
 */
export function ReaderPreviewDialog({
  open,
  onClose,
  editor,
  title,
  imageUrl,
  coverAlt,
  coverDecorative,
  isPremium,
}: ReaderPreviewDialogProps) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [showPaidContent, setShowPaidContent] = useState(false);
  useEffect(() => {
    if (!open) setShowPaidContent(false);
  }, [open]);
  const html = useEditorState({
    editor,
    selector: ({ editor: current }) => current.getHTML(),
  });

  const { before, after } = useMemo(() => splitAtPaywall(html), [html]);
  const paidWords = useMemo(() => countWordsInHtml(after), [after]);
  const readingMinutes = Math.max(1, Math.ceil(countWordsInHtml(html) / 200));
  const alt = coverDecorative ? '' : coverAlt?.trim() || title || t`Couverture de l'article`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} size="xl">
      <DialogContent className="max-h-[92vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-4 text-primary" aria-hidden />
            {t`Aperçu lecteur`}
          </DialogTitle>
          <DialogDescription>
            {t`Un aperçu du corps et de la couverture. La page publique ajoute les annotations et l'identité du tenant.`}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t`Taille d'aperçu`}
        >
          {(
            [
              { id: 'desktop', label: t`Bureau`, icon: Monitor },
              { id: 'tablet', label: t`Tablette`, icon: Tablet },
              { id: 'mobile', label: t`Mobile`, icon: Smartphone },
            ] as const
          ).map((option) => (
            <Button
              key={option.id}
              variant={device === option.id ? 'soft' : 'ghost'}
              tone={device === option.id ? 'brand' : 'neutral'}
              size="xs"
              onClick={() => setDevice(option.id)}
              aria-pressed={device === option.id}
            >
              <option.icon className="size-3.5" aria-hidden />
              {option.label}
            </Button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {t`${readingMinutes} min de lecture`}
          </span>
        </div>

        <DialogBody className="rounded-control bg-muted/25 p-3 sm:p-5">
          <div
            className={cn(
              'mx-auto min-h-[320px] rounded-panel border border-border/40 bg-background px-4 py-6 shadow-sm transition-[max-width] duration-200 sm:px-8',
              DEVICE_WIDTH[device]
            )}
          >
            {imageUrl ? (
              <div className="mb-5 overflow-hidden rounded-xl bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL distante de l'auteur. */}
                <img src={imageUrl} alt={alt} className="aspect-[21/9] w-full object-cover" />
              </div>
            ) : null}

            <p className="text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
              {t`Aperçu`}
            </p>
            <h2 className="mt-1 font-serif text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
              {title.trim() || t`Titre de l'article`}
            </h2>

            <div
              className="article-prose mt-5 max-w-none text-foreground/90 antialiased"
              dangerouslySetInnerHTML={{
                __html:
                  isPremium && after && !showPaidContent
                    ? before
                    : isPremium && after && showPaidContent
                      ? `${before}${after}`
                      : html,
              }}
            />

            {isPremium && after && !showPaidContent ? (
              <div className="my-5 rounded-xl border border-highlight/25 bg-highlight/5 p-4 text-center">
                <Lock className="mx-auto size-4 text-highlight" aria-hidden />
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {t`La suite est réservée aux abonnés`}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t`${paidWords} mot${paidWords === 1 ? '' : 's'} après la limite Premium.`}
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  className="mt-2"
                  onClick={() => setShowPaidContent(true)}
                >
                  {t`Afficher la suite (aperçu auteur)`}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t`Fermer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
