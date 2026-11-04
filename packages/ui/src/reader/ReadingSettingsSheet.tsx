'use client';

import { useState } from 'react';
import { t } from '@lingui/core/macro';
import { RotateCcw, Sparkles, Type, BookOpen, Eye, Sliders, Lock } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
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

  const fontOptions: { id: FontFamilyOption; label: string; sample: string; fontClass: string }[] =
    [
      { id: 'font-serif', label: t`Serif Littéraire`, sample: 'Aa', fontClass: 'font-serif' },
      { id: 'font-sans', label: t`Sans Épuré`, sample: 'Aa', fontClass: 'font-sans' },
      {
        id: 'font-dyslexic',
        label: t`OpenDyslexic`,
        sample: 'Aa',
        fontClass: 'font-sans tracking-wide leading-relaxed',
      },
    ];

  const fontSizes: { id: FontSizeOption; label: string; previewClass: string }[] = [
    { id: 'sm', label: 'A', previewClass: 'text-xs' },
    { id: 'base', label: 'A', previewClass: 'text-sm font-medium' },
    { id: 'lg', label: 'A', previewClass: 'text-base font-medium' },
    { id: 'xl', label: 'A', previewClass: 'text-lg font-semibold' },
    { id: '2xl', label: 'A', previewClass: 'text-xl font-bold' },
  ];

  const lineHeights: { id: LineHeightOption; label: string }[] = [
    { id: 'compact', label: t`Compact` },
    { id: 'normal', label: t`Standard` },
    { id: 'relaxed', label: t`Aéré` },
  ];

  const widths: { id: ReadingWidthOption; label: string }[] = [
    { id: 'narrow', label: t`Étroite` },
    { id: 'normal', label: t`Standard` },
    { id: 'wide', label: t`Large` },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-background/80 hover:bg-muted/70 text-foreground text-xs font-semibold shadow-2xs backdrop-blur-xs transition-all duration-150 cursor-pointer select-none active:scale-[0.98]',
          className
        )}
        title={t`Réglages d'accessibilité et de lecture`}
        aria-label={t`Réglages de lecture`}
      >
        <Type className="w-3.5 h-3.5 opacity-80" />
        <span>Aa</span>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-84 max-h-[85vh] overflow-y-auto p-4.5 bg-popover/95 backdrop-blur-md text-popover-foreground border border-border/50 rounded-2xl shadow-2xl z-50 text-left space-y-4 font-sans animate-in fade-in-0 duration-150 scrollbar-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="size-3.5" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t`Confort de Lecture`}
            </h4>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-muted/60 transition-colors cursor-pointer"
            title={t`Réinitialiser`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t`Défaut`}</span>
          </button>
        </div>

        {/* 1. Taille du texte (Sélecteur segmenté) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{t`Taille de police`}</span>
            <span className="text-[10px] font-mono text-muted-foreground/80 uppercase">
              {preferences.fontSize}
            </span>
          </div>
          <div className="flex items-center bg-muted/40 rounded-xl p-1 border border-border/40 gap-1">
            {fontSizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update({ fontSize: s.id })}
                className={cn(
                  'flex-1 h-8 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer select-none',
                  s.previewClass,
                  preferences.fontSize === s.id
                    ? 'bg-background text-foreground shadow-xs font-bold border border-border/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Polices de caractères */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground">
            {t`Typographie`}
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {fontOptions.map((font) => {
              const active = preferences.fontFamily === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => update({ fontFamily: font.id })}
                  className={cn(
                    'px-2.5 py-2 rounded-xl text-xs text-center border transition-all cursor-pointer flex flex-col items-center gap-0.5',
                    active
                      ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                      : 'border-border/40 hover:bg-muted/50 text-foreground'
                  )}
                >
                  <span className={cn('text-base font-semibold', font.fontClass)}>
                    {font.sample}
                  </span>
                  <span className="text-[10px] truncate max-w-full">{font.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Affichage des annotations (si piloté par le parent) */}
        {filterMode && onFilterModeChange && (
          <div className="space-y-2 border-t border-border/40 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span>{t`Affichage des annotations`}</span>
              </label>
            </div>
            <AnnotationFilterPill
              filterMode={filterMode}
              onChangeFilterMode={onFilterModeChange}
              allowPublicAnnotations={allowPublicAnnotations}
              size="sm"
              className="w-full justify-between"
            />
          </div>
        )}

        {/* 4. Neuro-Inclusion & TDAH (Bionic Reading & Règle) */}
        <div className="space-y-2.5 border-t border-border/40 pt-3">
          {/* Bionic Reading Toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>{t`Mode Bionic (TDAH)`}</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {t`Met en gras les 1res lettres pour fixer le regard`}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.bionicReading}
              onClick={() => update({ bionicReading: !preferences.bionicReading })}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 border duration-200',
                preferences.bionicReading
                  ? 'bg-primary border-primary'
                  : 'bg-muted border-border/60 hover:border-border'
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full bg-white transition-transform duration-200 absolute top-0.5 shadow-xs',
                  preferences.bionicReading ? 'translate-x-5.5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>

          {/* Reading Ruler Toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 opacity-80" />
                <span>{t`Règle de lecture`}</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {t`Masque de concentration suivant la souris`}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.readingRuler}
              onClick={() => update({ readingRuler: !preferences.readingRuler })}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 border duration-200',
                preferences.readingRuler
                  ? 'bg-primary border-primary'
                  : 'bg-muted border-border/60 hover:border-border'
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full bg-white transition-transform duration-200 absolute top-0.5 shadow-xs',
                  preferences.readingRuler ? 'translate-x-5.5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
        </div>

        {/* 5. Interligne & Largeur */}
        <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-3">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Sliders className="w-3 h-3" />
              {t`Interligne`}
            </label>
            <div className="flex bg-muted/40 rounded-lg p-0.5 border border-border/40 gap-0.5">
              {lineHeights.map((lh) => (
                <button
                  key={lh.id}
                  type="button"
                  onClick={() => update({ lineHeight: lh.id })}
                  className={cn(
                    'flex-1 h-6 text-[10px] font-medium rounded transition-colors cursor-pointer select-none',
                    preferences.lineHeight === lh.id
                      ? 'bg-background text-foreground shadow-2xs font-semibold border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {lh.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Sliders className="w-3 h-3" />
              {t`Colonne`}
            </label>
            <div className="flex bg-muted/40 rounded-lg p-0.5 border border-border/40 gap-0.5">
              {widths.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => update({ readingWidth: w.id })}
                  className={cn(
                    'flex-1 h-6 text-[10px] font-medium rounded transition-colors cursor-pointer select-none',
                    preferences.readingWidth === w.id
                      ? 'bg-background text-foreground shadow-2xs font-semibold border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 6. Papier (fiche Plus P1) : default/sepia/slate/oled gratuits
         * (accessibilité), warm/paper premium cadenassés sans Plus. */}
        <div className="space-y-1.5 border-t border-border/40 pt-3">
          <label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {t`Papier`}
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'default', label: t`Défaut`, swatch: 'bg-background border-border/60' },
                { id: 'sepia', label: t`Sépia`, swatch: 'bg-[#FBF0D9] border-[#EAD8B8]' },
                { id: 'slate', label: t`Ardoise`, swatch: 'bg-[#1E2024] border-[#2A2E35]' },
                { id: 'oled', label: t`Noir`, swatch: 'bg-black border-[#1C1C1C]' },
                { id: 'warm', label: t`Nuit chaude`, swatch: 'bg-[#1A1410] border-[#2E2519]' },
                { id: 'paper', label: t`Papier`, swatch: 'bg-[#F7F3EA] border-[#E0D6BE]' },
              ] as { id: PaperThemeOption; label: string; swatch: string }[]
            ).map((p) => {
              const premium = isPremiumPaperTheme(p.id);
              const locked = premium && plusThemesLocked;
              const active = preferences.paperTheme === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  title={locked ? t`Papier premium — réservé aux abonnés Plus` : p.label}
                  onClick={() => {
                    if (locked) {
                      onLockedThemeClick?.();
                      return;
                    }
                    update({ paperTheme: p.id });
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border transition-all cursor-pointer select-none',
                    active
                      ? 'border-primary bg-primary/10 shadow-2xs ring-1 ring-primary/30'
                      : 'border-border/40 hover:bg-muted/50 hover:border-border/60'
                  )}
                >
                  <span className={cn('w-6 h-6 rounded-full border shadow-2xs', p.swatch)} />
                  <span className="text-[10px] font-medium flex items-center gap-1">
                    {p.label}
                    {locked && <Lock className="w-2.5 h-2.5 text-muted-foreground" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t`Nuit chaude et Papier sont réservés aux abonnés Plus (bientôt).`}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
