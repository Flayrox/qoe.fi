'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Rss, Users } from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Checkbox } from '@qoe/ui/checkbox';
import { Input } from '@qoe/ui/input';
import { Select } from '@qoe/ui/select';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { UpcomingBadge } from '@qoe/ui';
import { StudioField, StudioSection } from '@/components/studio-page';
import {
  importSubscribersCsvAction,
  type SubscriberImportStats,
} from '@/app/(creator)/import/actions';

type ImportMode = 'articles' | 'subscribers';

const SOURCE_OPTIONS = [
  { id: 'substack', label: 'Substack' },
  { id: 'ghost', label: 'Ghost' },
  { id: 'beehiiv', label: 'Beehiiv' },
  { id: 'mailchimp', label: 'Mailchimp' },
  { id: 'cms_export', label: 'Export de mon CMS' },
  { id: 'csv_manual', label: 'Fichier constitué à la main' },
  { id: 'other', label: 'Autre' },
];

function ImportFeedback({
  tone,
  children,
}: {
  tone: 'success' | 'danger';
  children: React.ReactNode;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={
        tone === 'success'
          ? 'flex items-start gap-2 rounded-control border border-success/20 bg-success/10 px-3 py-2 text-xs text-success-text'
          : 'flex items-start gap-2 rounded-control border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive-text'
      }
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ImportTab() {
  const [mode, setMode] = useState<ImportMode>('articles');

  return (
    <div className="space-y-5">
      <Tabs
        variant="segmented"
        size="sm"
        value={mode}
        onValueChange={(value) => setMode(value as ImportMode)}
      >
        <TabList aria-label="Type d’importation">
          <Tab id="articles">
            <span className="inline-flex items-center gap-1.5">
              <Rss className="size-3.5" />
              Articles
            </span>
          </Tab>
          <Tab id="subscribers">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              Abonnés
            </span>
          </Tab>
        </TabList>
      </Tabs>

      {mode === 'articles' ? <ArticlesImportUpcoming /> : <SubscribersImport />}
    </div>
  );
}

function ArticlesImportUpcoming() {
  return (
    <StudioSection title="Importer des articles" icon={Rss}>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <UpcomingBadge feature="article-import" />
            <span className="text-[11px] text-muted-foreground">
              Suspendu pendant la refonte de l’import.
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            L’import RSS/Atom a été retiré temporairement. La première version pouvait créer des
            brouillons visibles et n’imposait pas de limite de volume : nous préférons le refaire
            proprement plutôt que de laisser un outil dangereux en production.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Vous pouvez continuer à écrire et publier normalement. Aucun email n’est envoyé aux
            abonnés du fait d’un import.
          </p>
        </div>

        <aside className="space-y-2 rounded-control border border-border/50 bg-muted/20 p-4 text-xs leading-relaxed text-muted-foreground lg:col-span-5">
          <p className="font-medium text-foreground">Ce que fera la refonte</p>
          <p>Plafond par import, aperçu avant création et rapport d’erreurs par article.</p>
          <p className="border-t border-border/40 pt-2">
            Les imports resteront des brouillons privés jusqu’à votre validation explicite.
          </p>
        </aside>
      </div>
    </StudioSection>
  );
}

function SubscribersImport() {
  const [source, setSource] = useState('csv_manual');
  const [sourceDetail, setSourceDetail] = useState('');
  const [collectionPeriod, setCollectionPeriod] = useState('');
  const [optInMethod, setOptInMethod] = useState('');
  const [noPurchased, setNoPurchased] = useState(false);
  const [noScraped, setNoScraped] = useState(false);
  const [noUnsubscribed, setNoUnsubscribed] = useState(false);
  const [suppressionListIdentified, setSuppressionListIdentified] = useState(false);
  const [consentPurpose, setConsentPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [stats, setStats] = useState<SubscriberImportStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const declarationsComplete =
    noPurchased &&
    noScraped &&
    noUnsubscribed &&
    suppressionListIdentified &&
    consentPurpose.trim().length > 0;

  const processFile = async (file: File) => {
    if (!declarationsComplete) {
      setMessage({
        tone: 'danger',
        text: 'Complétez les déclarations de provenance avant de déposer le fichier.',
      });
      return;
    }

    setLoading(true);
    setMessage(null);
    setStats(null);

    try {
      const content = await file.text();
      const res = await importSubscribersCsvAction(content, {
        source,
        sourceDetail,
        collectionPeriod,
        optInMethod,
        declarations: {
          noPurchased,
          noScraped,
          noUnsubscribed,
          suppressionListIdentified,
          consentPurpose,
        },
      });

      if (res.success) {
        setStats(res.stats ?? null);
        setMessage({
          tone: 'success',
          text: 'Liste déposée en revue. Aucun email n’a été envoyé et aucun contact n’a été créé.',
        });
      } else {
        setMessage({
          tone: 'danger',
          text: res.error || "Impossible de déposer la liste d'abonnés.",
        });
      }
    } catch {
      setMessage({ tone: 'danger', text: 'Impossible de lire ce fichier CSV.' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
  };

  return (
    <StudioSection title="Déposer une liste d’abonnés" icon={Users}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Importez un export CSV depuis votre ancienne plateforme. Le fichier part en revue :
            aucun email n’est envoyé, aucune adresse n’est rattachée à votre site et aucun contact
            n’est créé avant validation.
          </p>
          <Badge variant="soft" tone="neutral" size="xs">
            Revue manuelle
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StudioField label="Plateforme d’origine" htmlFor="import-source">
            <Select
              label="Plateforme d'origine"
              hideLabel
              size="sm"
              value={source}
              onValueChange={setSource}
              options={SOURCE_OPTIONS}
            />
          </StudioField>

          <StudioField label="Précisions (facultatif)" htmlFor="import-source-detail">
            <Input
              id="import-source-detail"
              size="sm"
              value={sourceDetail}
              onChange={(event) => setSourceDetail(event.target.value)}
              placeholder="Nom de l’ancien service, export utilisé…"
            />
          </StudioField>

          <StudioField label="Période de collecte" htmlFor="import-collection-period">
            <Input
              id="import-collection-period"
              size="sm"
              value={collectionPeriod}
              onChange={(event) => setCollectionPeriod(event.target.value)}
              placeholder="ex. mars 2019 – juin 2024"
            />
          </StudioField>

          <StudioField
            label="Comment le consentement a-t-il été recueilli ?"
            htmlFor="import-opt-in"
          >
            <Input
              id="import-opt-in"
              size="sm"
              value={optInMethod}
              onChange={(event) => setOptInMethod(event.target.value)}
              placeholder="ex. formulaire avec double confirmation"
            />
          </StudioField>
        </div>

        <StudioField
          label="Finalité annoncée lors de la collecte"
          htmlFor="import-consent-purpose"
          hint="Obligatoire pour que la liste puisse être examinée."
        >
          <Input
            id="import-consent-purpose"
            size="sm"
            value={consentPurpose}
            onChange={(event) => setConsentPurpose(event.target.value)}
            placeholder="ex. recevoir la newsletter hebdomadaire de cette publication"
          />
        </StudioField>

        <div className="grid grid-cols-1 gap-2.5 rounded-control border border-border/50 bg-muted/20 p-3 sm:grid-cols-2">
          <Checkbox
            size="sm"
            isSelected={noPurchased}
            onChange={setNoPurchased}
            label="Aucune adresse achetée ou louée"
          />
          <Checkbox
            size="sm"
            isSelected={noScraped}
            onChange={setNoScraped}
            label="Aucune adresse collectée sur le Web"
          />
          <Checkbox
            size="sm"
            isSelected={noUnsubscribed}
            onChange={setNoUnsubscribed}
            label="Aucune personne désabonnée"
          />
          <Checkbox
            size="sm"
            isSelected={suppressionListIdentified}
            onChange={setSuppressionListIdentified}
            label="Liste d’opposition identifiée"
          />
        </div>

        <input
          ref={fileInputRef}
          id="import-subscribers-file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileInput}
          className="sr-only"
        />

        <label
          htmlFor="import-subscribers-file"
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void processFile(file);
          }}
          className={
            dragging
              ? 'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-primary/60 bg-primary/5 px-4 py-7 text-center transition-colors'
              : declarationsComplete
                ? 'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-border/60 bg-muted/10 px-4 py-7 text-center transition-colors hover:border-primary/50 hover:bg-muted/20'
                : 'flex cursor-not-allowed flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-border/40 bg-muted/10 px-4 py-7 text-center opacity-60'
          }
          onClick={(event) => {
            if (!declarationsComplete) {
              event.preventDefault();
              setMessage({
                tone: 'danger',
                text: 'Complétez les déclarations de provenance avant de déposer le fichier.',
              });
            }
          }}
        >
          <span className="flex size-9 items-center justify-center rounded-control bg-primary/10 text-primary">
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-4" />
            )}
          </span>
          <span className="text-sm font-medium text-foreground">
            {loading
              ? 'Analyse du fichier en cours…'
              : declarationsComplete
                ? 'Déposez votre CSV ici'
                : 'Complétez les déclarations ci-dessus'}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {declarationsComplete
              ? 'ou cliquez pour choisir un fichier CSV'
              : 'Le dépôt sera disponible une fois les déclarations complétées.'}
          </span>
        </label>

        {message ? <ImportFeedback tone={message.tone}>{message.text}</ImportFeedback> : null}

        {stats ? (
          <div className="rounded-control border border-border/50 bg-muted/20 p-3 text-xs">
            <p className="mb-2 font-medium text-foreground">Bilan du dépôt — aucun envoi</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Adresses reçues</dt>
                <dd className="font-mono tabular-nums text-foreground">{stats.received}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">En attente de revue</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {stats.pendingConfirmation}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Déjà abonnées</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {stats.alreadySubscribed}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">En opposition</dt>
                <dd className="font-mono tabular-nums text-foreground">{stats.suppressed}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Doublons</dt>
                <dd className="font-mono tabular-nums text-foreground">{stats.duplicates}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Non exploitables</dt>
                <dd className="font-mono tabular-nums text-foreground">{stats.invalid}</dd>
              </div>
            </dl>
            {stats.truncated ? (
              <p className="mt-2 text-destructive-text">
                Fichier tronqué : seule une partie des lignes a été analysée.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </StudioSection>
  );
}
