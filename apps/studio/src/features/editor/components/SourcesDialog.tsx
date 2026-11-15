'use client';

import React, { useEffect, useState } from 'react';
import { BookMarked, Plus, Trash2 } from 'lucide-react';
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
import { Input } from '@qoe/ui/input';
import { buildSourcesHtml, type SourceRow } from '../lib/sources';

export interface SourcesDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

const EMPTY_ROW: SourceRow = { label: '', url: '' };

export function SourcesDialog({ open, onClose, onInsert }: SourcesDialogProps) {
  const [rows, setRows] = useState<SourceRow[]>([EMPTY_ROW]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows([EMPTY_ROW]);
      setError(null);
    }
  }, [open]);

  const update = (index: number, patch: Partial<SourceRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const insert = () => {
    const html = buildSourcesHtml(rows);
    if (!html) {
      setError(t`Ajoutez au moins une source avec une adresse valide.`);
      return;
    }
    onInsert(html);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} size="lg">
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked className="size-4 text-primary" aria-hidden />
            {t`Notes et sources`}
          </DialogTitle>
          <DialogDescription>
            {t`Ajoute une section « Sources » en fin d'article. Les libellés et les adresses restent modifiables dans le corps.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2 py-1">
          {rows.map((row, index) => (
            <div key={index} className="flex items-start gap-2">
              <Input
                size="sm"
                value={row.label}
                onChange={(event) => update(index, { label: event.target.value })}
                placeholder={t`Libellé (ex. Rapport annuel)`}
                aria-label={t`Libellé de la source ${index + 1}`}
              />
              <Input
                size="sm"
                value={row.url}
                onChange={(event) => update(index, { url: event.target.value })}
                placeholder={t`https://exemple.fr/source`}
                aria-label={t`Adresse de la source ${index + 1}`}
                inputMode="url"
              />
              <Button
                variant="ghost"
                size="xs"
                shape="icon"
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                disabled={rows.length === 1}
                aria-label={t`Supprimer la source ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}

          <Button
            variant="ghost"
            size="xs"
            onClick={() => setRows((current) => [...current, EMPTY_ROW])}
          >
            <Plus className="size-3.5" />
            {t`Ajouter une source`}
          </Button>

          {error ? <p className="text-[11px] text-destructive-text">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t`Annuler`}
          </Button>
          <Button variant="solid" tone="brand" size="sm" onClick={insert}>
            {t`Insérer les sources`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
