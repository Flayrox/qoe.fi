'use client';

import { useEffect, useState } from 'react';
import { FileText, Link2, Loader2, Search, Trash2, X } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { FieldError } from '@qoe/ui/field-error';
import { Input, InputGroup } from '@qoe/ui/input';
import { searchAllAction, type SearchArticleHit } from '@qoe/sdk/actions/search';
import { PopoverPanel } from '@qoe/ui/popover-panel';
import { useModKey } from '../hooks/useModKey';

export interface LinkEditorPanelProps {
  open: boolean;
  position: { top: number; left: number } | null;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
  onClose: () => void;
  canRemove: boolean;
  error?: string | null;
  /** Construit l'URL d'un article interne choisi dans la recherche. */
  resolveArticleUrl?: (hit: SearchArticleHit) => string;
}

/**
 * Édition d'un lien dans l'éditeur.
 *
 * Le panneau flottant et son comportement (Échap, clic extérieur, focus)
 * viennent de `PopoverPanel` ; le champ et son erreur du contrat. Il ne
 * reste ici que la décision métier : appliquer, ou retirer le lien.
 */
export function LinkEditorPanel({
  open,
  position,
  value,
  onChange,
  onApply,
  onRemove,
  onClose,
  canRemove,
  error,
  resolveArticleUrl,
}: LinkEditorPanelProps) {
  const MOD = useModKey();
  const [internalQuery, setInternalQuery] = useState('');
  const [internalResults, setInternalResults] = useState<SearchArticleHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setInternalQuery('');
      setInternalResults([]);
      setSearchError(null);
      return;
    }
    const query = internalQuery.trim();
    if (!resolveArticleUrl || query.length < 2) {
      setInternalResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      const res = await searchAllAction({
        query,
        type: 'articles',
        scope: 'mine',
        limit: 6,
        skipThoughts: true,
      });
      if (cancelled) return;
      setSearching(false);
      if (!res.ok) {
        setSearchError(res.error.message);
        setInternalResults([]);
        return;
      }
      setInternalResults(res.data?.articles ?? []);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, internalQuery, resolveArticleUrl]);
  return (
    <PopoverPanel open={open} onClose={onClose} label={t`Lien`} anchor={position}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Link2 className="size-3.5" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">{t`Lien`}</h4>
            <p className="text-[10px] text-muted-foreground">
              {t`Laissez vide ou retirez le lien existant`}
            </p>
          </div>
        </div>

        <Button size="xs" shape="icon" variant="ghost" onClick={onClose} aria-label={t`Fermer`}>
          <X />
        </Button>
      </div>

      <Input
        className=" h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
        autoFocus
        type="text"
        inputMode="url"
        size="sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onApply();
          }
        }}
        placeholder={t`https://exemple.com ou /rubrique/article`}
        invalid={Boolean(error)}
        aria-describedby={error ? 'link-url-error' : undefined}
      />

      {/* L'erreur s'annonce (role=alert) et le champ la référence :
          sans `aria-describedby`, elle n'existe que pour les voyants. */}
      <FieldError id="link-url-error">{error}</FieldError>

      {resolveArticleUrl ? (
        <div className="space-y-1.5 border-t border-border/30 pt-2">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t`Lien vers un de mes articles`}
          </p>
          <InputGroup size="sm" left={<Search className="size-3.5 text-muted-foreground" />}>
            <Input
              className=" h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              size="sm"
              value={internalQuery}
              onChange={(event) => setInternalQuery(event.target.value)}
              placeholder={t`Rechercher un titre…`}
              aria-label={t`Rechercher un article à lier`}
            />
          </InputGroup>
          {searching ? (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {t`Recherche…`}
            </p>
          ) : searchError ? (
            <p className="text-[10px] text-destructive-text">{searchError}</p>
          ) : internalResults.length > 0 ? (
            <ul className="max-h-36 space-y-0.5 overflow-y-auto">
              {internalResults.map((hit) => (
                <li key={hit.id}>
                  <Button
                    variant="ghost"
                    block
                    onClick={() => {
                      onChange(resolveArticleUrl(hit));
                      setInternalQuery('');
                      setInternalResults([]);
                    }}
                    className="w-full! items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px]! text-foreground hover:bg-muted/60 h-auto! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal "
                  >
                    <FileText className="mt-0.5 size-3! shrink-0 text-primary" aria-hidden />
                    <span className="line-clamp-2">{hit.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : internalQuery.trim().length >= 2 ? (
            <p className="text-[10px] text-muted-foreground">{t`Aucun article trouvé.`}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border/30 pt-2">
        {canRemove ? (
          <Button
            size="xs"
            variant="outline"
            tone="danger"
            onClick={onRemove}
            aria-label={t`Retirer le lien`}
          >
            <Trash2 />
            {t`Retirer`}
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground/70">{t`${MOD}K`}</span>
        )}

        <div className="flex items-center gap-2">
          <Button size="xs" variant="ghost" onClick={onClose}>
            {t`Annuler`}
          </Button>
          <Button size="xs" variant="solid" tone="brand" onClick={onApply}>
            {t`Appliquer`}
          </Button>
        </div>
      </div>
    </PopoverPanel>
  );
}
