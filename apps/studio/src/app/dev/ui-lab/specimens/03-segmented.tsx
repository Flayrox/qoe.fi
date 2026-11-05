'use client';

import { useState } from 'react';
import { Button } from '@qoe/ui/button';
import { Tab, TabList, TabPanel, Tabs } from '@qoe/ui/tabs';
import { cn } from '@qoe/utils';
import { Highlighter, Quote, PenLine, Volume2 } from 'lucide-react';
import { DefectList, Variant } from '../specimen-frame';

const OPTIONS = [
  { id: 'articles', label: 'Articles', count: 128 },
  { id: 'categories', label: 'Catégories', count: 12 },
  { id: 'medias', label: 'Médias', count: 340 },
];

const SETTINGS_TABS = [
  { id: 'general', label: 'Général' },
  { id: 'editorial', label: 'Ligne éditoriale' },
  { id: 'members', label: 'Membres', count: 6 },
  { id: 'billing', label: 'Facturation', disabled: true },
];

export function SegmentedSpecimen() {
  const [legacy, setLegacy] = useState('articles');
  const [segmented, setSegmented] = useState('articles');
  const [section, setSection] = useState('general');

  return (
    <div className="grid gap-10">
      <Variant
        label="Onglets soulignés faits main"
        kind="actuel"
        hint="C’est le pattern historique des réglages : bordure basse de 2 px, couleur primaire sur le trait, boutons en vrac sans rôle ARIA."
      >
        <div className="flex gap-5 border-b border-border/40">
          {OPTIONS.map((option) => {
            const selected = legacy === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setLegacy(option.id)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-xs transition-colors',
                  selected
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <DefectList
          items={[
            'Le trait primaire colore un état de navigation, pas une action',
            'Aucune gestion clavier : pas de role=tablist, pas de flèches',
            'La hauteur dépend du contenu (pt-1 pb-2.5) au lieu d’une échelle fixe',
          ]}
        />
      </Variant>

      <Variant
        label="Tabs — segmenté en creux (@qoe/ui/tabs)"
        kind="candidat"
        hint="Pour basculer une vue, une période ou un filtre court. Le rail en creux (bg-muted/40) tombe exactement sur la hauteur h-control-* du bouton adjacent ; flèches gauche/droite et Home/End sont gérés par react-aria."
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs variant="segmented" size="sm" value={segmented} onValueChange={setSegmented}>
              <TabList aria-label="Filtrer le catalogue">
                {OPTIONS.map((option) => (
                  <Tab key={option.id} id={option.id} count={option.count}>
                    {option.label}
                  </Tab>
                ))}
              </TabList>
            </Tabs>

            <Button variant="outline" size="sm">
              Exporter ({OPTIONS.find((item) => item.id === segmented)?.count ?? 0})
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
              <Tabs key={size} variant="segmented" size={size} defaultValue="day">
                <TabList aria-label={`Période (${size})`}>
                  <Tab id="day">7 j</Tab>
                  <Tab id="month">30 j</Tab>
                  <Tab id="year">12 m</Tab>
                </TabList>
              </Tabs>
            ))}
          </div>
        </div>
      </Variant>

      <Variant
        label="Tabs — segmenté en creux, icônes seules et infobulles"
        kind="candidat"
        hint="Le même rail en creux que le sélecteur de base (rounded-control bg-muted/40). `iconOnly` réduit un onglet à son icône ; le libellé reste le nom accessible (`aria-label`) et s’affiche dans une infobulle flottante au survol. La barre passe de la largeur d’un paragraphe à celle de quatre icônes — sans perdre la navigation aux flèches."
      >
        <div className="grid gap-4">
          <Tabs variant="segmented" size="sm" defaultValue="highlight">
            <TabList aria-label="Actions sur la sélection">
              <Tab id="highlight" icon={Highlighter} iconOnly tooltip="Surligner">
                Surligner
              </Tab>
              <Tab id="quote" icon={Quote} iconOnly tooltip="Citer">
                Citer
              </Tab>
              <Tab id="note" icon={PenLine} iconOnly tooltip="Annoter">
                Annoter
              </Tab>
              <Tab id="listen" icon={Volume2} iconOnly tooltip="Écouter">
                Écouter
              </Tab>
            </TabList>
            <TabPanel id="highlight">
              <p className="type-control-sm text-muted-foreground">
                Pose un trait sur le passage, sans note : un surlignage, pas une annotation.
              </p>
            </TabPanel>
            <TabPanel id="quote">
              <p className="type-control-sm text-muted-foreground">
                Publie le passage sur le Feed, attribué à son auteur.
              </p>
            </TabPanel>
            <TabPanel id="note">
              <p className="type-control-sm text-muted-foreground">
                Ouvre le formulaire : une note privée, ou une annotation publique.
              </p>
            </TabPanel>
            <TabPanel id="listen">
              <p className="type-control-sm text-muted-foreground">
                Lit la sélection à voix haute sans quitter l’article.
              </p>
            </TabPanel>
          </Tabs>

          <Tabs variant="segmented" size="sm" defaultValue="day">
            <TabList aria-label="Période (segmenté, avec libellés)">
              <Tab id="day">7 j</Tab>
              <Tab id="month">30 j</Tab>
              <Tab id="year">12 m</Tab>
            </TabList>
          </Tabs>
        </div>
      </Variant>

      <Variant
        label="Tabs — souligné sobre de section (@qoe/ui/tabs)"
        kind="candidat"
        hint="Même primitive, variant='underline' : pour les sections d’une page (Profil, Réglages, Analytics). Hauteur fixe h-control-md, trait actif en border-foreground (jamais primaire) et panneaux reliés par aria-controls."
      >
        <div className="max-w-xl">
          <Tabs variant="underline" size="md" value={section} onValueChange={setSection}>
            <TabList aria-label="Sections des réglages">
              {SETTINGS_TABS.map((tab) => (
                <Tab key={tab.id} id={tab.id} count={tab.count} disabled={tab.disabled}>
                  {tab.label}
                </Tab>
              ))}
            </TabList>
            <TabPanel id="general">
              <p className="type-control-sm text-muted-foreground">
                Identité publique, sous-domaine et langue principale de la publication.
              </p>
            </TabPanel>
            <TabPanel id="editorial">
              <p className="type-control-sm text-muted-foreground">
                Charte de citation, politique d’annotations et signature par défaut.
              </p>
            </TabPanel>
            <TabPanel id="members">
              <p className="type-control-sm text-muted-foreground">
                Six journalistes et éditeurs disposent d’un accès actif à l’espace.
              </p>
            </TabPanel>
          </Tabs>
        </div>
      </Variant>
    </div>
  );
}
