'use client';

import { useState } from 'react';
import { t } from '@lingui/core/macro';
import { RotateCcw, Lock } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../primitives/button/button';
import { Switch } from '../primitives/switch/switch';
import { ToggleButton, ToggleGroup } from '../primitives/toggle/toggle-button';
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

/* 📖 Ce que le panneau a perdu, et pourquoi.
 *
 * Il empilait six sections sous un titre en capitales, chacune précédée d'une
 * icône décorative (livre, étincelle, œil, curseurs), dans une carte
 * `rounded-2xl` floutée à `shadow-2xl`. Trois symptômes d'un même défaut : le
 * décor parlait plus fort que les réglages. Ici, trois groupes seulement —
 * le texte, la lecture, le papier — des libellés en phrase, et zéro icône sur
 * les intitulés.
 *
 * Et les commandes viennent du contrat : `ToggleGroup` / `ToggleButton` pour
 * les choix exclusifs, `Switch` pour les deux interrupteurs, `Button` pour le
 * retour au défaut. Les 23 `<button>` faits main qui vivaient ici avaient
 * chacun leur rayon, leur ombre et leur état actif — c'est exactement ce que
 * l'audit UI compte comme dette.
 */

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
      label: t`OpenDyslexic`,
      fontClass: 'font-sans tracking-wide leading-relaxed',
    },
  ];

  // Cinq boutons dont le texte visible est le même « A » : sans `ariaLabel`,
  // un lecteur d'écran annonçait « A, A, A, A, A » et le choix était
  // impossible à faire sans voir.
  const fontSizes: {
    id: FontSizeOption;
    label: string;
    ariaLabel: string;
    previewClass: string;
  }[] = [
    { id: 'sm', label: 'A', ariaLabel: t`Petite taille`, previewClass: 'text-[11px]' },
    { id: 'base', label: 'A', ariaLabel: t`Taille standard`, previewClass: 'text-xs' },
    { id: 'lg', label: 'A', ariaLabel: t`Grande taille`, previewClass: 'text-sm' },
    { id: 'xl', label: 'A', ariaLabel: t`Très grande taille`, previewClass: 'text-base' },
    { id: '2xl', label: 'A', ariaLabel: t`Taille maximale`, previewClass: 'text-lg' },
  ];

  const lineHeights: { id: LineHeightOption; label: string }[] = [
    { id: 'compact', label: t`Serré` },
    { id: 'normal', label: t`Normal` },
    { id: 'relaxed', label: t`Aéré` },
  ];

  const widths: { id: ReadingWidthOption; label: string }[] = [
    { id: 'narrow', label: t`Étroite` },
    { id: 'normal', label: t`Normale` },
    { id: 'wide', label: t`Large` },
  ];

  const papers: { id: PaperThemeOption; label: string; swatch: string }[] = [
    { id: 'default', label: t`Défaut`, swatch: 'bg-background border-border/60' },
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
        className="w-72 gap-0 overflow-hidden rounded-panel border-border p-0 shadow-lg ring-0"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <h4 className="text-xs font-medium text-foreground">{t`Confort de lecture`}</h4>
          <Button
            size="xs"
            variant="ghost"
            onClick={reset}
            title={t`Rétablir les réglages par défaut`}
            className="text-muted-foreground"
          >
            <RotateCcw className="size-3" strokeWidth={1.75} />
            {t`Défaut`}
          </Button>
        </div>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto px-3 py-3">
          {/* 1. Le texte */}
          <section className="space-y-1.5">
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
                  size="sm"
                  aria-label={s.ariaLabel}
                  className="flex-1 justify-center rounded-[max(calc(var(--radius-button)-2px),4px)] px-0"
                >
                  <span className={s.previewClass}>{s.label}</span>
                </ToggleButton>
              ))}
            </ToggleGroup>
          </section>

          <section className="space-y-1.5">
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
                  size="sm"
                  className="h-auto flex-1 flex-col gap-0.5 rounded-[max(calc(var(--radius-button)-2px),4px)] py-1.5"
                >
                  <span className={cn('text-sm leading-tight', font.fontClass)}>Aa</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {font.label}
                  </span>
                </ToggleButton>
              ))}
            </ToggleGroup>
          </section>

          <section className="grid grid-cols-2 gap-3">
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
                    className="flex-1 justify-center rounded-[max(calc(var(--radius-button)-2px),4px)] px-0"
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
                    className="flex-1 justify-center rounded-[max(calc(var(--radius-button)-2px),4px)] px-0"
                  >
                    {w.label}
                  </ToggleButton>
                ))}
              </ToggleGroup>
            </div>
          </section>

          {/* 2. La lecture (neuro-inclusion) */}
          <section className="space-y-3 border-t border-border/60 pt-4">
            <Switch
              size="sm"
              isSelected={preferences.bionicReading}
              onChange={(isSelected) => update({ bionicReading: isSelected })}
              label={t`Mode Bionic (TDAH)`}
              description={t`Met en gras les premières lettres pour fixer le regard`}
            />
            <Switch
              size="sm"
              isSelected={preferences.readingRuler}
              onChange={(isSelected) => update({ readingRuler: isSelected })}
              label={t`Règle de lecture`}
              description={t`Masque de concentration qui suit le curseur`}
            />
          </section>

          {/* 3. Affichage des annotations (si piloté par le parent) */}
          {filterMode && onFilterModeChange && (
            <section className="space-y-1.5 border-t border-border/60 pt-4">
              <span className={SECTION_LABEL}>{t`Affichage des annotations`}</span>
              <AnnotationFilterPill
                filterMode={filterMode}
                onChangeFilterMode={onFilterModeChange}
                allowPublicAnnotations={allowPublicAnnotations}
                size="sm"
                className="w-full"
              />
            </section>
          )}

          {/* 4. Papier (fiche Plus P1) : default/sepia/slate/oled gratuits
           * (accessibilité), warm/paper premium cadenassés sans Plus. */}
          <section className="space-y-1.5 border-t border-border/60 pt-4">
            <span className={SECTION_LABEL}>{t`Papier`}</span>
            <div className="grid grid-cols-3 gap-1.5">
              {papers.map((p) => {
                const locked = isPremiumPaperTheme(p.id) && plusThemesLocked;
                const active = preferences.paperTheme === p.id;
                return (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="xs"
                    title={locked ? t`Papier premium — réservé aux abonnés Plus` : p.label}
                    aria-label={locked ? `${p.label} — ${t`réservé aux abonnés Plus`}` : p.label}
                    aria-pressed={active}
                    onClick={() => {
                      if (locked) {
                        onLockedThemeClick?.();
                        return;
                      }
                      update({ paperTheme: p.id });
                    }}
                    className={cn(
                      'h-auto flex-col gap-1.5 px-2 py-2 font-normal',
                      active
                        ? 'border-foreground/30 bg-muted/60'
                        : 'border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <span className={cn('size-4 rounded-full border', p.swatch)} />
                    <span className="flex items-center gap-1 text-[10px]">
                      {p.label}
                      {locked && <Lock className="size-2.5" strokeWidth={1.75} />}
                    </span>
                  </Button>
                );
              })}
            </div>
            <p className="pt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {t`Nuit chaude et Papier : abonnés Plus.`}
            </p>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
