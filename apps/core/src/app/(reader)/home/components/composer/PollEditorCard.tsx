'use client';

import React from 'react';
import { BarChart2, Trash2, X } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Select } from '@qoe/ui/select';

interface PollEditorCardProps {
  pollOptions: string[];
  pollDurationHours: number;
  onOptionsChange: (options: string[]) => void;
  onDurationChange: (hours: number) => void;
  onClose: () => void;
}

export function PollEditorCard({
  pollOptions,
  pollDurationHours,
  onOptionsChange,
  onDurationChange,
  onClose,
}: PollEditorCardProps) {
  return (
    <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-3 font-sans my-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-primary flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4" />
          Créer un sondage
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
          title="Retirer le sondage"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {pollOptions.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              placeholder={`Option ${idx + 1}`}
              value={opt}
              onChange={(e) => {
                const updated = [...pollOptions];
                updated[idx] = e.target.value;
                onOptionsChange(updated);
              }}
              maxLength={80}
              className="flex-1 bg-background/80 border border-border/60 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            />
            {pollOptions.length > 2 && (
              <button
                type="button"
                onClick={() => onOptionsChange(pollOptions.filter((_, i) => i !== idx))}
                className="p-1.5 text-muted-foreground hover:text-destructive-text transition-colors cursor-pointer"
                title="Supprimer cette option"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 text-xs">
        {pollOptions.length < 4 ? (
          <button
            type="button"
            onClick={() => onOptionsChange([...pollOptions, ''])}
            className="text-primary font-semibold hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
          >
            + Ajouter une option
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
          <span>{t`Durée :`}</span>
          <Select
            label={t`Durée du vote`}
            hideLabel
            size="xs"
            className="w-28"
            value={String(pollDurationHours)}
            onValueChange={(value) => onDurationChange(Number(value))}
            options={[
              { id: '1', label: t`1 heure` },
              { id: '6', label: t`6 heures` },
              { id: '24', label: t`1 jour` },
              { id: '72', label: t`3 jours` },
              { id: '168', label: t`7 jours` },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
