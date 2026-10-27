'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';
import { ThemeToggle } from '@qoe/ui/ui/ThemeToggle';
import { cn } from '@qoe/utils';
import type { Catalog } from './catalog-types';
import { SpecimenFrame } from './specimen-frame';
import { MenuDropdownSpecimen } from './specimens/01-menu-dropdown';
import { SelectSpecimen } from './specimens/02-select';
import { SegmentedSpecimen } from './specimens/03-segmented';
import { RadioCardsSpecimen } from './specimens/04-radio-cards';
import { MultiSelectSpecimen } from './specimens/05-multi-select';
import { SwitchSpecimen } from './specimens/06-switch';
import { ButtonSpecimen } from './specimens/08-button';
import { FieldsSpecimen } from './specimens/09-fields';
import { OverlaysSpecimen } from './specimens/10-overlays';
import { DatesSpecimen } from './specimens/11-dates';
import { CompositionSpecimen } from './specimens/12-composition';
import { InputsComplexSpecimen } from './specimens/13-inputs-complexes';
import { SelectionTablesSpecimen } from './specimens/14-selection-tables';
import { PortedPiecesSpecimen } from './specimens/15-ported-pieces';

const SPECIMENS = [
  {
    id: '01-menu',
    index: '01',
    title: 'Menu déroulant',
    question:
      'Trois menus coexistent : la primitive, un dropdown fait main et aucun alignement. Lequel devient la référence ?',
    sources: [
      'packages/ui/src/ui/dropdown-menu.tsx',
      'apps/studio/src/features/dashboard/components/HeaderWorkspaceSwitcher.tsx',
    ],
    Component: MenuDropdownSpecimen,
  },
  {
    id: '02-select',
    index: '02',
    title: 'Select',
    question:
      'La primitive existe mais n’est utilisée nulle part dans les apps. Quelle hauteur, quels rayons, avec ou sans icône ?',
    sources: ['packages/ui/src/ui/select.tsx'],
    Component: SelectSpecimen,
  },
  {
    id: '03-segmented',
    index: '03',
    title: 'Sélecteur segmenté / onglets',
    question:
      'Les réglages utilisent des onglets soulignés faits main. On garde, on passe en segmenté, ou on autorise la pilule animée ?',
    sources: ['apps/studio/src/features/settings/settings.tsx'],
    Component: SegmentedSpecimen,
  },
  {
    id: '04-radio-cards',
    index: '04',
    title: 'Cartes de choix',
    question:
      'Choix de mise en page ou de thème : la sélection est-elle portée par une bordure, une coche, ou les deux ?',
    sources: [],
    notes:
      'Aucun composant dédié aujourd’hui : le choix de mise en page est dispersé dans les écrans.',
    Component: RadioCardsSpecimen,
  },
  {
    id: '05-multi-select',
    index: '05',
    title: 'Sélection multiple',
    question:
      'Filtres et étiquettes : chips à bascule, avec ou sans croix, et comment afficher le décompte ?',
    sources: ['packages/ui/src/annotations/AnnotationFilterPill.tsx'],
    Component: MultiSelectSpecimen,
  },
  {
    id: '06-switch',
    index: '06',
    title: 'Interrupteur',
    question:
      'Les réglages utilisent un bouton sans sémantique. On aligne sur un switch accessible, avec quel état actif ?',
    sources: ['apps/studio/src/features/settings/tabs/recommendations.tsx'],
    Component: SwitchSpecimen,
  },
  {
    id: '08-button',
    index: '08',
    title: 'Bouton — la primitive de référence',
    question:
      'Le contrat en action : quatre variantes, quatre tons, quatre densités, aucune valeur en dur. Est-ce le niveau de finition attendu pour les 28 autres ?',
    sources: [
      'packages/ui/src/primitives/button/button.tsx',
      'packages/ui/src/primitives/contract.ts',
      'packages/theme/src/styles/tokens.css',
    ],
    Component: ButtonSpecimen,
  },
  {
    id: '09-fields',
    index: '09',
    title: 'Champs — saisie et erreur',
    question:
      'Le contrat s’étend-il proprement aux champs ? Densité partagée avec le bouton, erreur reliée au champ, groupe avec icône.',
    sources: [
      'packages/ui/src/primitives/input/input.tsx',
      'packages/ui/src/primitives/field/field-error.tsx',
    ],
    Component: FieldsSpecimen,
  },
  {
    id: '10-overlays',
    index: '10',
    title: 'Overlays — menu, sélection, panneau, notification',
    question:
      'Les quatre surfaces flottantes du produit. Le menu maison tient-il encore, et que gagne-t-on à passer sur react-aria ?',
    sources: [
      'packages/ui/src/primitives/dropdown/dropdown.tsx',
      'packages/ui/src/primitives/select/select.tsx',
      'packages/ui/src/primitives/drawer/drawer.tsx',
      'packages/ui/src/primitives/toast/toast.tsx',
    ],
    Component: OverlaysSpecimen,
  },
  {
    id: '11-dates',
    index: '11',
    title: 'Dates et calendrier',
    question:
      'Trois saisies de date coexistent, aucune ne dit son format. On unifie sur des segments typés, avec un calendrier réellement utilisable au clavier ?',
    sources: [
      'packages/ui/src/primitives/date/calendar.tsx',
      'packages/ui/src/primitives/date/date-picker.tsx',
    ],
    Component: DatesSpecimen,
  },
  {
    id: '12-composition',
    index: '12',
    title: 'Composition — avatars, accordéon, bascules, barre',
    question:
      'Les pièces qui composent un écran sans le structurer : une personne, une section repliable, un état enfoncé, une barre d’outils. Chacune a une sémantique, pas seulement un style.',
    sources: [
      'packages/ui/src/primitives/avatar/avatar.tsx',
      'packages/ui/src/primitives/accordion/accordion.tsx',
      'packages/ui/src/primitives/toggle/toggle-button.tsx',
      'packages/ui/src/primitives/toolbar/toolbar.tsx',
    ],
    Component: CompositionSpecimen,
  },
  {
    id: '13-inputs-complexes',
    index: '13',
    title: 'Saisies longues — recherche, table, couleur',
    question:
      'Les contrôles qui demandent plus qu’une valeur : filtrer une liste, trier un tableau, choisir une couleur. Chacun doit rester utilisable au clavier seul.',
    sources: [
      'packages/ui/src/primitives/combobox/combobox.tsx',
      'packages/ui/src/primitives/table/table.tsx',
      'packages/ui/src/primitives/color/color.tsx',
    ],
    Component: InputsComplexSpecimen,
  },
  {
    id: '14-selection-tables',
    index: '14',
    title: 'Sélection & tables du Studio',
    question:
      'Cocher, sélectionner une ligne, trier une liste dense : quatre tables réelles du Studio, et une case dont on règle la marque — coche, point ou plein — sans quitter la page.',
    sources: [
      'packages/ui/src/primitives/checkbox/checkbox.tsx',
      'packages/ui/src/primitives/table/table.tsx',
      'packages/ui/src/primitives/contract.ts',
    ],
    Component: SelectionTablesSpecimen,
  },
  {
    id: '15-ported-pieces',
    index: '15',
    title: 'Pièces rapportées — opensourceui',
    question:
      'Ce qui mérite d’être repris d’un composant qu’on copie-colle : le trait tracé à la main, la touche qu’on sent sous le doigt, le geste de maintien. Qu’est-ce qui reste du caractère une fois passé aux tokens ?',
    sources: [
      'packages/ui/src/primitives/annotation-mark/annotation-mark.tsx',
      'packages/ui/src/primitives/bevel-button/bevel-button.tsx',
      'packages/ui/src/primitives/hold-to-delete/hold-to-delete-button.tsx',
      'packages/ui/src/primitives/copy-button/copy-button.tsx',
      'packages/ui/src/primitives/save-button/save-button.tsx',
    ],
    Component: PortedPiecesSpecimen,
  },
];

const TOKENS = [
  { token: '--background', label: 'Canvas' },
  { token: '--card', label: 'Surface 1' },
  { token: '--muted', label: 'Surface 2' },
  { token: '--border', label: 'Séparateur' },
  { token: '--foreground', label: 'Texte principal' },
  { token: '--muted-foreground', label: 'Texte secondaire' },
  { token: '--primary', label: 'Action' },
  { token: '--accent-brand', label: 'Marque (opt-in)' },
];

const RULES = [
  'Tokens uniquement : les surfaces passent par les variables du thème (background, card, muted, border), jamais par une couleur brute.',
  'Un seul jeu de rayons : celui du thème (--radius-sm/md/lg/xl). Pas de valeurs ad hoc du type 20px.',
  'Séparateurs capillaires (border-border/40) ; les panneaux flottants portent une ombre et un anneau, pas une bordure pleine.',
  'Le survol change la surface (accent ou muted), jamais la couleur de marque.',
  'Icônes Lucide en stroke 1.5, aucune icône décorative, aucun emoji dans l’interface.',
  'Une hauteur par rôle : h-7 compact, h-8 standard, h-9 confortable.',
];

export function UiLab({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState('');

  const specimenPaths = useMemo(
    () => new Set(SPECIMENS.flatMap((specimen) => specimen.sources)),
    []
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return catalog.families;
    return catalog.families
      .map((family) => ({
        ...family,
        items: family.items.filter(
          (item) =>
            item.name.toLowerCase().includes(normalized) ||
            item.path.toLowerCase().includes(normalized)
        ),
      }))
      .filter((family) => family.items.length > 0);
  }, [catalog.families, query]);

  const matchCount = filtered.reduce((sum, family) => sum + family.items.length, 0);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-5">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="text-[13px] font-semibold tracking-tight">UI Lab</span>
            <span className="rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
              dev only
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden font-mono text-[10.5px] tabular-nums text-muted-foreground sm:block">
              {SPECIMENS.length} spécimens · {catalog.total} composants inventoriés
            </span>
            <ThemeToggle />
            <Link
              href="/"
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Studio
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-border/40 px-4 py-6 lg:flex">
          <p className="mb-3 text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
            Sommaire
          </p>
          <nav className="grid gap-0.5">
            <RailLink href="#tokens">00 · Règles & tokens</RailLink>
            {SPECIMENS.map((specimen) => (
              <RailLink key={specimen.id} href={`#${specimen.id}`}>
                {specimen.index} · {specimen.title}
              </RailLink>
            ))}
            <RailLink href="#inventaire">Inventaire complet</RailLink>
          </nav>

          <p className="mt-6 mb-2 text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
            Familles
          </p>
          <div className="grid gap-0.5">
            {catalog.families.map((family) => (
              <a
                key={family.id}
                href="#inventaire"
                className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <span className="truncate">{family.label.replace(/ \(.*\)$/, '')}</span>
                <span className="font-mono text-[10px] tabular-nums">{family.items.length}</span>
              </a>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 pt-6 pb-24 sm:px-8">
          <div className="mb-8 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            <a
              href="#tokens"
              className="shrink-0 rounded-md border border-border/50 px-2 py-1 text-[11.5px] text-muted-foreground"
            >
              Règles
            </a>
            {SPECIMENS.map((specimen) => (
              <a
                key={specimen.id}
                href={`#${specimen.id}`}
                className="shrink-0 rounded-md border border-border/50 px-2 py-1 text-[11.5px] text-muted-foreground"
              >
                {specimen.index}
              </a>
            ))}
          </div>

          <section id="tokens" className="scroll-mt-6">
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">00</span>
              <h2 className="text-[17px] font-semibold tracking-tight">Règles & tokens</h2>
            </div>{' '}
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Ces règles ne viennent pas d’un document de spec : elles décrivent ce que le code déjà
              en production fait majoritairement. Elles servent de point de comparaison — un écart
              n’est pas une faute, c’est une décision à assumer explicitement.
            </p>
            <div className="mt-4 grid gap-6 rounded-xl border border-border/40 bg-card p-6 sm:p-7">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {RULES.map((rule) => (
                  <p
                    key={rule}
                    className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground"
                  >
                    <span
                      aria-hidden
                      className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60"
                    />
                    <span>{rule}</span>
                  </p>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-5 sm:grid-cols-4">
                {TOKENS.map((item) => (
                  <div key={item.token} className="min-w-0">
                    <div
                      className="h-9 w-full rounded-md border border-border/40"
                      style={{ background: `var(${item.token})` }}
                    />
                    <p className="mt-1.5 truncate text-[11px] text-foreground">{item.label}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {item.token}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Les pastilles lisent les variables CSS en direct : basculez le thème en haut à
                droite, elles changent avec le thème actif.
              </p>
            </div>
          </section>

          <div className="mt-12 grid gap-12">
            {SPECIMENS.map((specimen) => (
              <SpecimenFrame
                key={specimen.id}
                id={specimen.id}
                index={specimen.index}
                title={specimen.title}
                question={specimen.question}
                sources={specimen.sources}
                notes={specimen.notes}
              >
                <specimen.Component />
              </SpecimenFrame>
            ))}
          </div>

          <section id="inventaire" className="mt-16 scroll-mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    07
                  </span>
                  <h2 className="text-[17px] font-semibold tracking-tight">Inventaire complet</h2>
                </div>{' '}
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  Tout ce que contient l’UI du monorepo, généré depuis le code — y compris ce qui
                  n’a pas encore de spécimen. Le badge « lab » signale les fichiers déjà mis en
                  scène ci-dessus, et le compteur d’usage dit combien de fichiers d’app importent
                  réellement chaque module partagé.
                </p>
              </div>
              <label className="flex h-8 w-full items-center gap-2 rounded-md border border-border/50 bg-card px-2 sm:w-64">
                <Search className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filtrer par nom ou chemin…"
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="font-mono text-[10.5px] text-muted-foreground hover:text-foreground"
                  >
                    esc
                  </button>
                )}
              </label>
            </div>

            <p className="mt-3 font-mono text-[10.5px] tabular-nums text-muted-foreground">
              {matchCount} résultat{matchCount > 1 ? 's' : ''} · catalogue du{' '}
              {new Date(catalog.generatedAt).toLocaleDateString('fr-FR')} · régénérer avec{' '}
              <code className="rounded bg-muted/50 px-1 py-0.5">pnpm ui:catalog</code>
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Signal
                value={`${catalog.signals.primitivesNeverImported} / ${catalog.signals.primitivesTotal}`}
                label="primitives jamais importées"
                detail="aucun fichier d’app ne les utilise"
              />
              <Signal
                value={String(catalog.signals.rawButtons)}
                label="boutons natifs écrits à la main"
                detail={`dans ${catalog.signals.rawButtonFiles} fichiers`}
              />
              <Signal
                value={String(catalog.signals.nativeSelectFiles)}
                label="fichiers avec un select natif"
                detail="au lieu du composant partagé"
              />
              <Signal
                value={String(catalog.signals.handRolledOverlays)}
                label="overlays faits main"
                detail="fixed inset-0 ou role=dialog"
              />
            </div>

            <div className="mt-4 grid max-h-[70vh] gap-8 overflow-y-auto rounded-xl border border-border/40 bg-card p-6 sm:p-7">
              {filtered.map((family) => (
                <div key={family.id}>
                  <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5">
                    <h3 className="text-[12.5px] font-medium text-foreground">{family.label}</h3>
                    <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                      {family.items.length}
                    </span>
                  </div>
                  <ul className="grid gap-0">
                    {family.items.map((item) => (
                      <li
                        key={item.path}
                        className="flex items-baseline gap-2 border-b border-border/20 py-1 last:border-0"
                      >
                        <span className="truncate font-mono text-[11px] text-foreground">
                          {item.path}
                        </span>
                        {specimenPaths.has(item.path) && (
                          <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-px font-mono text-[9.5px] text-primary">
                            lab
                          </span>
                        )}
                        {item.usages !== null && (
                          <span
                            className={cn(
                              'shrink-0 rounded px-1 py-px font-mono text-[9.5px] tabular-nums',
                              item.usages === 0
                                ? 'bg-destructive/10 text-destructive-text'
                                : 'bg-muted/50 text-muted-foreground'
                            )}
                          >
                            {item.usages === 0
                              ? '0 usage'
                              : `${item.usages} usage${item.usages > 1 ? 's' : ''}`}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {item.lines} l.
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground">
                  Aucun composant ne correspond à « {query} ».
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Signal({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card px-3 py-2.5">
      <p className="font-mono text-[15px] leading-none tabular-nums text-foreground">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-foreground">{label}</p>
      <p className="text-[10.5px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function RailLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={cn(
        'flex h-7 items-center rounded-md px-2 text-[12px] text-muted-foreground transition-colors',
        'hover:bg-muted/50 hover:text-foreground'
      )}
    >
      {children}
    </a>
  );
}
