'use client';

import { useState } from 'react';
import { t } from '@lingui/core/macro';
import { RotateCcw, Lock } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../primitives/button/button';
import { Switch } from '../primitives/switch/switch';
import { ToggleButton, ToggleGroup } from '../primitives/toggle/toggle-button';
import { Tooltip } from '../primitives/tooltip/tooltip';
import { useReadingPreferences } from './ReadingPreferencesContext';
import { AnnotationFilterPill } from '../annotations/AnnotationFilterPill';
import type { AnnotationFilterMode } from '../annotations/types';
import type {
  FontFamilyOption,
  FontSizeOption,
  LineHeightOption,
  PaperThemeOption,
  ReadingWidthOption,
} from './types';
import { isPremiumPaperTheme } from './types';

export interface ReadingSettingsSheetProps {
  className?: string;
  /** Gate Plus (fiche P1) : thèmes premium verrouillés (moteur neutre). */
  plusThemesLocked?: boolean;
  onLockedThemeClick?: () => void;
  /** Mode de filtrage des annotations (si synchronisé avec le lecteur). */
  filterMode?: AnnotationFilterMode;
  onFilterModeChange?: (mode: AnnotationFilterMode) => void;
  allowPublicAnnotations?: boolean;
}

const SECTION_LABEL = 'text-[11px] font-medium text-muted-foreground';

export function ReadingSettingsSheet({
  className = '',
  plusThemesLocked = false,
  onLockedThemeClick,
  filterMode,
  onFilterModeChange,
  allowPublicAnnotations = true,
}: ReadingSettingsSheetProps) {
  const { preferences, update, reset } = useReadingPreferences();
  const [isOpen, setIsOpen] = useState(false);

  const fontOptions: { id: FontFamilyOption; label: string; fontClass: string }[] = [
    { id: 'font-serif', label: t`Serif`, fontClass: 'font-serif' },
    { id: 'font-sans', label: t`Sans`, fontClass: 'font-sans' },
    {
      id: 'font-dyslexic',
      label: t`Dyslexique`,
      fontClass: 'font-sans tracking-wide',
    },
  ];

  // Cinq tailles progressives sur un seul rail segmenté : A⁻ -> A⁺
  const fontSizes: {
    id: FontSizeOption;
    label: string;
    ariaLabel: string;
    previewClass: string;
  }[] = [
    { id: 'sm', label: 'A', ariaLabel: t`Petite taille`, previewClass: 'text-[11px]' },
    { id: 'base', label: 'A', ariaLabel: t`Taille standard`, previewClass: 'text-xs' },
    { id: 'lg', label: 'A', ariaLabel: t`Grande taille`, previewClass: 'text-sm font-medium' },
    {
      id: 'xl',
      label: 'A',
      ariaLabel: t`Très grande taille`,
      previewClass: 'text-base font-semibold',
    },
    { id: '2xl', label: 'A', ariaLabel: t`Taille maximale`, previewClass: 'text-lg font-bold' },
  ];

  const lineHeights: { id: LineHeightOption; label: string }[] = [
    { id: 'compact', label: t`Serré` },
    { id: 'normal', label: t`Normal` },
    { id: 'relaxed', label: t`Aéré` },
  ];

  const widths: { id: ReadingWidthOption; label: string }[] = [
    { id: 'narrow', label: t`Étroit` },
    { id: 'normal', label: t`Normal` },
    { id: 'wide', label: t`Large` },
  ];

  const papers: { id: PaperThemeOption; label: string; swatch: string }[] = [
    { id: 'default', label: t`Défaut`, swatch: 'bg-background border-border/70' },
    { id: 'sepia', label: t`Sépia`, swatch: 'bg-[#FBF0D9] border-[#EAD8B8]' },
    { id: 'slate', label: t`Ardoise`, swatch: 'bg-[#1E2024] border-[#2A2E35]' },
    { id: 'oled', label: t`Noir`, swatch: 'bg-black border-[#1C1C1C]' },
    { id: 'warm', label: t`Nuit chaude`, swatch: 'bg-[#1A1410] border-[#2E2519]' },
    { id: 'paper', label: t`Papier`, swatch: 'bg-[#F7F3EA] border-[#E0D6BE]' },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          'flex h-8 items-center rounded-control border border-border/60 bg-background px-2.5 font-serif text-[13px] leading-none font-medium text-foreground transition-colors hover:bg-muted/60',
          className
        )}
        title={t`Réglages d'accessibilité et de lecture`}
        aria-label={t`Réglages de lecture`}
      >
        Aa
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label={t`Confort de lecture`}
        className="w-80 gap-0 overflow-hidden rounded-panel border-border p-0 shadow-xl ring-0"
      >
        {/* En-tête sobre avec bouton de réinitialisation */}
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2">
          <h4 className="text-xs font-semibold tracking-tight text-foreground">{t`Confort de lecture`}</h4>
          <Button
            size="xs"
            variant="ghost"
            onClick={reset}
            title={t`Rétablir les réglages par défaut`}
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" strokeWidth={1.75} />
            {t`Défaut`}
          </Button>
        </div>

        {/* Corps compact sans scrollbar */}
        <div className="space-y-3.5 p-3.5">
          {/* 1. Taille du texte */}
          <div className="space-y-1.5">
            <span className={SECTION_LABEL}>{t`Taille du texte`}</span>
            <ToggleGroup
              aria-label={t`Taille du texte`}
              variant="inset"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[preferences.fontSize]}
              onSelectionChange={(keys) => {
                const [next] = keys;
                if (next) update({ fontSize: next as FontSizeOption });
              }}
              className="w-full"
            >
              {fontSizes.map((s) => (
                <ToggleButton
                  key={s.id}
                  id={s.id}
                  size="xs"
                  aria-label={s.ariaLabel}
                  className="flex-1 justify-center rounded-[max(calc(var(--radius-button)-2px),4px)] px-0"
                >
                  <span className={s.previewClass}>{s.label}</span>
                </ToggleButton>
              ))}
            </ToggleGroup>
          </div>

          {/* 2. Police sur un seul rail segmenté avec aperçu typographique */}
          <div className="space-y-1.5">
            <span className={SECTION_LABEL}>{t`Police`}</span>
            <ToggleGroup
              aria-label={t`Police`}
              variant="inset"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[preferences.fontFamily]}
              onSelectionChange={(keys) => {
                const [next] = keys;
                if (next) update({ fontFamily: next as FontFamilyOption });
              }}
              className="w-full"
            >
              {fontOptions.map((font) => (
                <ToggleButton
                  key={font.id}
                  id={font.id}
                  size="xs"
                  className="flex-1 justify-center rounded-[max(calc(var(--radius-button)-2px),4px)] px-2 py-1"
                >
                  <span className={cn('text-xs leading-none', font.fontClass)}>{font.label}</span>
                </ToggleButton>
              ))}
            </ToggleGroup>
          </div>

          {/* 3. Interligne & Colonne côte à côte */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <span className={SECTION_LABEL}>{t`Interligne`}</span>
              <ToggleGroup
                aria-label={t`Interligne`}
                variant="inset"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[preferences.lineHeight]}
                onSelectionChange={(keys) => {
                  const [next] = keys;
                  if (next) update({ lineHeight: next as LineHeightOption });
                }}
                className="w-full"
              >
                {lineHeights.map((lh) => (
                  <ToggleButton
                    key={lh.id}
                    id={lh.id}
                    size="xs"
                    className="flex-1 justify-center rounded-[max(calc(var(--radius-button)-2px),4px)] px-0 text-[11px]"
                  >
                    {lh.label}
                  </ToggleButton>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-1.5">
              <span className={SECTION_LABEL}>{t`Colonne`}</span>
              <ToggleGroup
                aria-label={t`Largeur de colonne`}
                variant="inset"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[preferences.readingWidth]}
                onSelectionChange={(keys) => {
                  const [next] = keys;
                  if (next) update({ readingWidth: next as ReadingWidthOption });
                }}
                className="w-full"
              >
                {widths.map((w) => (
                  <ToggleButton
                    key={w.id}
                    id={w.id}
                    size="xs"
                    className="flex-1 justify-center rounded-[max(calc(var(--radius-button)-2px),4px)] px-0 text-[11px]"
                  >
                    {w.label}
                  </ToggleButton>
                ))}
              </ToggleGroup>
            </div>
          </div>

          {/* 4. Thèmes papier en bandeau circulaire horizontal */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={SECTION_LABEL}>{t`Papier`}</span>
              {plusThemesLocked && (
                <span className="text-[10px] text-muted-foreground/80">{t`Plus : Nuit chaude & Papier`}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-1 rounded-control bg-muted/40 p-1">
              {papers.map((p) => {
                const locked = isPremiumPaperTheme(p.id) && plusThemesLocked;
                const active = preferences.paperTheme === p.id;
                const tooltip = locked ? `${p.label} — ${t`réservé aux abonnés Plus`}` : p.label;
                return (
                  <Tooltip key={p.id} content={tooltip} placement="top">
                    <button
                      type="button"
                      aria-label={tooltip}
                      aria-pressed={active}
                      onClick={() => {
                        if (locked) {
                          onLockedThemeClick?.();
                          return;
                        }
                        update({ paperTheme: p.id });
                      }}
                      className={cn(
                        'relative flex size-7 items-center justify-center rounded-full transition-transform duration-150',
                        active && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                        locked && 'opacity-70 hover:opacity-100',
                        'hover:scale-105 active:scale-95'
                      )}
                    >
                      <span className={cn('size-6 rounded-full border shadow-2xs', p.swatch)} />
                      {locked && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/25 text-white">
                          <Lock className="size-2.5" strokeWidth={2.5} />
                        </span>
                      )}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* 5. Neuro-inclusion compacte (lignes fines avec switches) */}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">{t`Mode Bionic`}</span>
                <span className="text-[10px] text-muted-foreground">{t`(TDAH)`}</span>
              </div>
              <Switch
                size="sm"
                aria-label={t`Mode Bionic (TDAH)`}
                isSelected={preferences.bionicReading}
                onChange={(isSelected) => update({ bionicReading: isSelected })}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{t`Règle de lecture`}</span>
              <Switch
                size="sm"
                aria-label={t`Règle de lecture`}
                isSelected={preferences.readingRuler}
                onChange={(isSelected) => update({ readingRuler: isSelected })}
              />
            </div>
          </div>

          {/* 6. Affichage des annotations si piloté par le parent */}
          {filterMode && onFilterModeChange && (
            <div className="border-t border-border/60 pt-3">
              <AnnotationFilterPill
                filterMode={filterMode}
                onChangeFilterMode={onFilterModeChange}
                allowPublicAnnotations={allowPublicAnnotations}
                size="sm"
                className="w-full justify-between"
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
