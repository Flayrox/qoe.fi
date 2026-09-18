'use client';

import { useState } from 'react';
import { t } from '@lingui/core/macro';
import { RotateCcw, Sparkles, Type, BookOpen, Eye, Sliders } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useReadingPreferences } from './ReadingPreferencesContext';
import type {
  FontFamilyOption,
  FontSizeOption,
  LineHeightOption,
  ReadingWidthOption,
} from './types';

export function ReadingSettingsSheet({ className = '' }: { className?: string }) {
  const { preferences, update, reset } = useReadingPreferences();
  const [isOpen, setIsOpen] = useState(false);

  const fontOptions: { id: FontFamilyOption; label: string; fontClass: string }[] = [
    { id: 'font-serif', label: t`Serif Littéraire`, fontClass: 'font-serif' },
    { id: 'font-sans', label: t`Sans Épuré`, fontClass: 'font-sans' },
    { id: 'font-dyslexic', label: t`OpenDyslexic`, fontClass: 'font-mono tracking-wide' },
    { id: 'font-mono', label: t`Monospace`, fontClass: 'font-mono' },
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
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-background/90 hover:bg-muted/80 text-foreground text-xs font-semibold shadow-xs transition-colors cursor-pointer select-none ${className}`}
        title={t`Réglages d'accessibilité et de lecture`}
        aria-label={t`Réglages de lecture`}
      >
        <Type className="w-3.5 h-3.5 opacity-80" />
        <span>Aa</span>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-4 bg-popover text-popover-foreground border border-border/60 rounded-2xl shadow-2xl z-50 text-left space-y-4 font-sans animate-in fade-in-0 duration-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t`Confort de Lecture`}
            </h4>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
            title={t`Réinitialiser`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t`Défaut`}</span>
          </button>
        </div>

        {/* 1. Taille du texte (Sélecteur segmenté) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground">
            {t`Taille de police`}
          </label>
          <div className="flex items-center bg-muted/60 rounded-xl p-1 border border-border/30">
            {fontSizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update({ fontSize: s.id })}
                className={`flex-1 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${s.previewClass} ${
                  preferences.fontSize === s.id
                    ? 'bg-background text-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
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
          <div className="grid grid-cols-2 gap-1.5">
            {fontOptions.map((font) => (
              <button
                key={font.id}
                type="button"
                onClick={() => update({ fontFamily: font.id })}
                className={`px-3 py-2 rounded-xl text-xs text-left border transition-all cursor-pointer truncate ${font.fontClass} ${
                  preferences.fontFamily === font.id
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border/40 hover:bg-muted/60 text-foreground'
                }`}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Neuro-Inclusion & TDAH (Bionic Reading & Règle) */}
        <div className="space-y-2 border-t border-border/40 pt-3">
          {/* Bionic Reading Toggle */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-highlight" />
                <span>{t`Mode Bionic (TDAH)`}</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {t`Met en gras les 1res lettres pour fixer le regard`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => update({ bionicReading: !preferences.bionicReading })}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                preferences.bionicReading ? 'bg-primary' : 'bg-muted border border-border/50'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                  preferences.bionicReading ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Reading Ruler Toggle */}
          <div className="flex items-center justify-between gap-2">
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
              onClick={() => update({ readingRuler: !preferences.readingRuler })}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                preferences.readingRuler ? 'bg-primary' : 'bg-muted border border-border/50'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                  preferences.readingRuler ? 'left-6' : 'left-1'
                }`}
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
            <div className="flex bg-muted/60 rounded-lg p-0.5 border border-border/30">
              {lineHeights.map((lh) => (
                <button
                  key={lh.id}
                  type="button"
                  onClick={() => update({ lineHeight: lh.id })}
                  className={`flex-1 h-6 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                    preferences.lineHeight === lh.id
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
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
            <div className="flex bg-muted/60 rounded-lg p-0.5 border border-border/30">
              {widths.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => update({ readingWidth: w.id })}
                  className={`flex-1 h-6 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                    preferences.readingWidth === w.id
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
