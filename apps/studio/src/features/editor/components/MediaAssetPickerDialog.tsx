'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2, Search } from 'lucide-react';
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
import { Input, InputGroup } from '@qoe/ui/input';
import { cn } from '@qoe/utils';
import { listMediaAssetsAction, type MediaAssetSummary } from '../actions/media-assets';

export interface MediaAssetPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAssetSummary) => void;
  /** Filtre optionnel : ARTICLE_COVER, ARTICLE_BODY… */
  targetType?: string;
  title?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '')} Mo`;
}

/**
 * Sélecteur de la médiathèque existante. Il ne crée aucun asset : il choisit
 * une URL déjà possédée par l'utilisateur, que l'éditeur enregistre ensuite
 * comme une image normale (couverture ou corps).
 */
export function MediaAssetPickerDialog({
  open,
  onClose,
  onSelect,
  targetType,
  title,
}: MediaAssetPickerDialogProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<MediaAssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Une frappe rapide lance plusieurs requêtes : sans numéro de séquence, la
  // réponse la plus lente écrase la plus récente et l'auteur voit la liste
  // d'une recherche qu'il a déjà remplacée.
  const requestSeqRef = useRef(0);

  const load = useCallback(
    async (offset: number, append: boolean) => {
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;
      setLoading(true);
      setError(null);
      const result = await listMediaAssetsAction({
        query: debounced,
        targetType,
        offset,
        limit: 24,
      });
      if (requestId !== requestSeqRef.current) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        if (!append) setItems([]);
        return;
      }
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setHasMore(result.hasMore);
      setNextOffset(result.nextOffset);
    },
    [debounced, targetType]
  );

  useEffect(() => {
    if (!open) return;
    void load(0, false);
  }, [open, load]);

  const choose = (asset: MediaAssetSummary) => {
    onSelect(asset);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} size="xl">
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-4 text-primary" aria-hidden />
            {title ?? t`Médiathèque`}
          </DialogTitle>
          <DialogDescription>
            {t`Choisissez une image déjà envoyée sur votre compte. Elle sera reprise sans nouvel upload.`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-1">
          <InputGroup left={<Search className="size-3.5 text-muted-foreground" />}>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t`Rechercher par adresse d'image…`}
              aria-label={t`Rechercher dans la médiathèque`}
            />
          </InputGroup>
        </div>

        <DialogBody className="min-h-[220px]">
          {loading && items.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              {t`Chargement de la médiathèque…`}
            </div>
          ) : error ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-destructive-text">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load(0, false)}>
                {t`Réessayer`}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <ImageIcon className="size-5" aria-hidden />
              <p className="text-sm font-medium text-foreground">{t`Aucune image`}</p>
              <p className="max-w-xs text-xs">
                {debounced
                  ? t`Aucun asset ne correspond à cette recherche.`
                  : t`Vos prochains uploads apparaîtront ici.`}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {items.map((asset, index) => {
                const dimensions =
                  asset.width && asset.height ? `${asset.width}×${asset.height}` : '';
                const meta = [dimensions, formatBytes(asset.sizeBytes)].filter(Boolean).join(' · ');
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => choose(asset)}
                      className="group block w-full overflow-hidden rounded-control border border-border/45 bg-muted/10 text-left transition-colors hover:border-primary/45 hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                      aria-label={t`Utiliser l'image ${index + 1}`}
                    >
                      <span className="relative block aspect-[4/3] overflow-hidden bg-muted/30">
                        {/* eslint-disable-next-line @next/next/no-img-element -- assets distants arbitraires de la médiathèque. */}
                        <img
                          src={asset.url}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      </span>
                      <span className="block px-2 py-1.5">
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {meta || asset.mimeType}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>

        <DialogFooter className={cn('justify-between', items.length === 0 && 'justify-end')}>
          {hasMore ? (
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load(nextOffset, true)}
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t`Charger plus`}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="solid" tone="brand" size="sm" onClick={onClose}>
            {t`Fermer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
