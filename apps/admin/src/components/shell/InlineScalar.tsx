'use client';

import * as React from 'react';
import { Select, type SelectOption } from '@qoe/ui/select';
import { Input } from '@qoe/ui/ui/input';
import { Checkbox } from '@qoe/ui/checkbox';
import { cn } from '@qoe/utils';

// =====================================================================
// ✏️ InlineScalar — composants d'édition inline génériques pour DataGrid
// =====================================================================
// Fournit l'édition optimiste au fil de l'eau dans les cellules de tableau :
// - Mise à jour immédiate de l'affichage (zéro latence perçue par l'opérateur)
// - Exécution asynchrone de la mutation
// - Rollback automatique à l'ancienne valeur en cas de rejet/erreur
// - Statut inline « Audité · à HH:MM:SS »
// =====================================================================

export interface InlineChoiceOption extends SelectOption {
  tone?: string;
}

export interface InlineChoiceProps {
  value: string;
  options: InlineChoiceOption[];
  onSave: (nextValue: string) => Promise<boolean | void>;
  label: string;
  onStatus?: (message: string) => void;
  successLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function InlineChoice({
  value,
  options,
  onSave,
  label,
  onStatus,
  successLabel = 'Modifié',
  disabled = false,
  className,
}: InlineChoiceProps) {
  const [current, setCurrent] = React.useState(value);
  const [isSaving, setIsSaving] = React.useState(false);

  // Synchronise si la prop externe change
  React.useEffect(() => {
    setCurrent(value);
  }, [value]);

  const handleChange = async (nextValue: string) => {
    if (nextValue === current) return;
    const previous = current;
    setCurrent(nextValue);
    setIsSaving(true);

    try {
      const result = await onSave(nextValue);
      if (result === false) {
        setCurrent(previous);
      } else if (onStatus) {
        onStatus(`${successLabel} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      }
    } catch {
      setCurrent(previous);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={cn(
        'relative inline-flex items-center min-w-0',
        isSaving && 'opacity-70',
        className
      )}
    >
      <Select
        label={label}
        hideLabel
        size="xs"
        value={current}
        options={options}
        disabled={disabled || isSaving}
        onValueChange={handleChange}
        className="w-full text-[11px]"
      />
    </div>
  );
}

export interface InlineTextProps {
  value: string;
  onSave: (nextValue: string) => Promise<boolean | void>;
  label: string;
  placeholder?: string;
  onStatus?: (message: string) => void;
  successLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function InlineText({
  value,
  onSave,
  label,
  placeholder = 'Cliquer pour modifier',
  onStatus,
  successLabel = 'Texte modifié',
  disabled = false,
  className,
}: InlineTextProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [current, setCurrent] = React.useState(value);
  const [draft, setDraft] = React.useState(value);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setCurrent(value);
    setDraft(value);
  }, [value]);

  const commit = async () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed === current) return;

    const previous = current;
    setCurrent(trimmed);
    setIsSaving(true);

    try {
      const result = await onSave(trimmed);
      if (result === false) {
        setCurrent(previous);
        setDraft(previous);
      } else if (onStatus) {
        onStatus(`${successLabel} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      }
    } catch {
      setCurrent(previous);
      setDraft(previous);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(current);
      setIsEditing(false);
    }
  };

  if (isEditing && !disabled) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={handleKeyDown}
        aria-label={label}
        className={cn(
          'h-6 w-full rounded border-border bg-background px-1.5 text-[11px] tabular-nums text-foreground shadow-none focus-visible:ring-1 focus-visible:ring-ring',
          className
        )}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      onClick={() => {
        if (!disabled && !isSaving) {
          setDraft(current);
          setIsEditing(true);
        }
      }}
      onKeyDown={(event) => {
        if (!disabled && !isSaving && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          setDraft(current);
          setIsEditing(true);
        }
      }}
      className={cn(
        'group flex h-6 w-full cursor-pointer items-center truncate rounded px-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
        !current && 'italic text-muted-foreground/60',
        isSaving && 'opacity-70 cursor-wait',
        disabled && 'cursor-not-allowed hover:bg-transparent hover:text-muted-foreground',
        className
      )}
    >
      <span className="truncate">{current || placeholder}</span>
    </div>
  );
}

export interface InlineDateProps {
  value: string | null;
  onSave: (nextIso: string) => Promise<boolean | void>;
  label: string;
  onStatus?: (message: string) => void;
  successLabel?: string;
  disabled?: boolean;
  className?: string;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function InlineDate({
  value,
  onSave,
  label,
  onStatus,
  successLabel = 'Échéance modifiée',
  disabled = false,
  className,
}: InlineDateProps) {
  const initialLocal = toLocalInput(value);
  const [draft, setDraft] = React.useState(initialLocal);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(toLocalInput(value));
  }, [value]);

  const commit = async () => {
    if (draft === initialLocal) return;

    const previousLocal = initialLocal;
    setIsSaving(true);
    const nextIso = draft ? new Date(draft).toISOString() : '';

    try {
      const result = await onSave(nextIso);
      if (result === false) {
        setDraft(previousLocal);
      } else if (onStatus) {
        onStatus(`${successLabel} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      }
    } catch {
      setDraft(previousLocal);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Input
      type="datetime-local"
      aria-label={label}
      disabled={disabled || isSaving}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      className={cn(
        'h-6 w-full rounded border-transparent bg-transparent px-1 text-[11px] tabular-nums text-muted-foreground shadow-none hover:border-border focus:border-border focus:bg-background focus:text-foreground focus-visible:ring-0',
        isSaving && 'opacity-70',
        className
      )}
    />
  );
}

export interface InlineToggleProps {
  checked: boolean;
  onSave: (nextChecked: boolean) => Promise<boolean | void>;
  label: string;
  onStatus?: (message: string) => void;
  successLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function InlineToggle({
  checked,
  onSave,
  label,
  onStatus,
  successLabel = 'Statut modifié',
  disabled = false,
  className,
}: InlineToggleProps) {
  const [current, setCurrent] = React.useState(checked);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setCurrent(checked);
  }, [checked]);

  const handleChange = async (nextChecked: boolean) => {
    const previous = current;
    setCurrent(nextChecked);
    setIsSaving(true);

    try {
      const result = await onSave(nextChecked);
      if (result === false) {
        setCurrent(previous);
      } else if (onStatus) {
        onStatus(`${successLabel} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      }
    } catch {
      setCurrent(previous);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn('inline-flex items-center', isSaving && 'opacity-70', className)}>
      <Checkbox
        isSelected={current}
        onChange={handleChange}
        isDisabled={disabled || isSaving}
        aria-label={label}
      />
    </div>
  );
}
