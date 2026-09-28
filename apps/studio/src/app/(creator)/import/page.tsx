'use client';

import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  Rss,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Users,
  FileSpreadsheet,
} from 'lucide-react';
import {
  importRssFeedAction,
  importSubscribersCsvAction,
  type SubscriberImportStats,
} from './actions';
import { t } from '@lingui/core/macro';

export default function CreatorImportPage() {
  const [rssUrl, setRssUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [successMsg, setSuccessMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Provenance déclarée : le staff en a besoin pour évaluer le lot, et une
  // déclaration manquante bloque la soumission (fiche 03 §3).
  const [source, setSource] = useState('substack');
  const [sourceDetail, setSourceDetail] = useState('');
  const [collectionPeriod, setCollectionPeriod] = useState('');
  const [optInMethod, setOptInMethod] = useState('');
  const [noPurchased, setNoPurchased] = useState(false);
  const [noScraped, setNoScraped] = useState(false);
  const [noUnsubscribed, setNoUnsubscribed] = useState(false);
  const [suppressionListIdentified, setSuppressionListIdentified] = useState(false);
  const [consentPurpose, setConsentPurpose] = useState('');
  const [importStats, setImportStats] = useState<SubscriberImportStats | null>(null);

  const declarationsComplete =
    noPurchased &&
    noScraped &&
    noUnsubscribed &&
    suppressionListIdentified &&
    consentPurpose.trim().length > 0;

  const handleRssImport = async () => {
    if (!rssUrl.trim() || !rssUrl.startsWith('http')) {
      setErrorMessage(
        'Veuillez saisir une URL de flux RSS valide (ex: https://macha.substack.com/feed).'
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await importRssFeedAction(rssUrl);
    setLoading(false);

    if (res.success) {
      setSuccessMessage(
        `🎉 Succès ! ${res.count} nouveaux articles ont été importés dans vos publications.`
      );
      setRssUrl('');
    } else {
      setErrorMessage(res.error || "Impossible d'importer les articles depuis ce flux.");
    }
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Les déclarations de provenance conditionnent le dépôt : elles sont
    // exigées avant d'ouvrir le fichier, et revérifiées côté serveur (l'API ne
    // fait pas confiance au client pour une déclaration d'origine licite).
    if (!declarationsComplete) {
      setErrorMessage(
        'Complétez d’abord les déclarations de provenance : origine licite de la liste, absence d’adresses achetées ou collectées sur le Web, absence de désabonnés et finalité annoncée.'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setCsvLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setImportStats(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
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
      setCsvLoading(false);
      if (res.success) {
        setImportStats(res.stats ?? null);
        setSuccessMessage(
          'Liste déposée en revue. Aucun email n’a été envoyé et aucun contact n’a été créé : le staff examine le dossier avant toute suite.'
        );
      } else {
        setErrorMessage(res.error || "Impossible de déposer la liste d'abonnés.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setCsvLoading(false);
      setErrorMessage('Erreur lors de la lecture du fichier CSV.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 text-foreground">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
          <Upload className="w-3.5 h-3.5" />
          <span>Migration 1-Clic World-Class</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Importer depuis Substack & Ghost
        </h1>
        <p className="text-muted-foreground text-base max-w-2xl">
          Migrez instantanément vos articles passés sans perdre un seul lecteur.
        </p>
      </div>

      {/* Status Notifications */}
      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 mb-8 bg-success/10 border border-success/20 text-success rounded-2xl flex items-start gap-3"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">{successMsg}</span>
        </motion.div>
      )}

      {errorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 mb-8 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </motion.div>
      )}

      {/* RSS Import */}
      <div className="bg-card border border-border/40 rounded-3xl p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
          <Rss className="w-3.5 h-3.5" />
          <span>{t`Importation des articles & publications`}</span>
        </div>
        <h2 className="text-xl font-bold mb-2">Importation des articles & publications</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Entrez l'URL de votre flux RSS Substack (ex:{' '}
          <code className="text-primary font-semibold">https://macha.substack.com/feed</code>) ou
          Ghost.
        </p>

        <div className="mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            URL du flux RSS
          </label>
          <input
            type="url"
            value={rssUrl}
            onChange={(e) => setRssUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRssImport()}
            placeholder="https://macha.substack.com/feed"
            className="w-full p-4 rounded-2xl bg-muted/40 border border-border/40 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <button
          onClick={handleRssImport}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <span>Aspirer et importer tous les articles</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* CSV Subscribers Import */}
      <div className="mt-8 bg-card border border-border/40 rounded-3xl p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium mb-4">
          <Users className="w-3.5 h-3.5" />
          <span>{t`Importation de la liste d'abonnés`}</span>
        </div>
        <h2 className="text-xl font-bold mb-2">{t`Déposer une liste d'abonnés (Substack, Beehiiv, Ghost)`}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t`Déposez votre fichier `}
          <code className="text-foreground font-semibold">subscribers.csv</code>
          {t` exporté depuis votre ancienne plateforme. Le fichier part en revue : aucun email n'est envoyé, aucune adresse n'est rattachée à votre publication et aucun contact n'est créé tant que le staff n'a pas statué.`}
        </p>

        {/* Provenance déclarée : nécessaire à la revue, revérifiée côté serveur. */}
        <div className="mb-6 space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <p className="text-sm font-semibold">{t`Provenance de la liste`}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t`Plateforme d'origine`}</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="substack">Substack</option>
                <option value="ghost">Ghost</option>
                <option value="beehiiv">Beehiiv</option>
                <option value="mailchimp">Mailchimp</option>
                <option value="cms_export">Export de mon CMS</option>
                <option value="csv_manual">Fichier constitué à la main</option>
                <option value="other">Autre</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t`Précisions (facultatif)`}</span>
              <input
                value={sourceDetail}
                onChange={(e) => setSourceDetail(e.target.value)}
                placeholder={t`Nom de l'ancien service, export utilisé…`}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t`Période de collecte`}</span>
              <input
                value={collectionPeriod}
                onChange={(e) => setCollectionPeriod(e.target.value)}
                placeholder={t`ex. mars 2019 – juin 2024`}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t`Comment ces personnes ont-elles donné leur accord ?`}</span>
              <input
                value={optInMethod}
                onChange={(e) => setOptInMethod(e.target.value)}
                placeholder={t`ex. formulaire d'inscription avec double confirmation`}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">{t`Finalité annoncée aux personnes lors de la collecte`}</span>
            <input
              value={consentPurpose}
              onChange={(e) => setConsentPurpose(e.target.value)}
              placeholder={t`ex. recevoir la newsletter hebdomadaire de cette publication`}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-2 pt-1">
            {[
              {
                checked: noPurchased,
                set: setNoPurchased,
                label: t`Cette liste ne contient aucune adresse achetée ou louée.`,
              },
              {
                checked: noScraped,
                set: setNoScraped,
                label: t`Aucune adresse n'a été collectée sur le Web.`,
              },
              {
                checked: noUnsubscribed,
                set: setNoUnsubscribed,
                label: t`Aucune personne désabonnée n'y figure.`,
              },
              {
                checked: suppressionListIdentified,
                set: setSuppressionListIdentified,
                label: t`J'ai identifié la liste des personnes qui se sont opposées à ces envois.`,
              },
            ].map((item) => (
              <label key={item.label} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                  className="mt-0.5"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t`Ces déclarations ne dispensent pas de la revue : le staff confronte vos éléments aux contrôles techniques.`}
          </p>
        </div>

        {importStats && (
          <div className="mb-4 rounded-2xl border border-border/60 bg-muted/20 p-4 text-xs">
            <p className="mb-2 text-sm font-semibold">{t`Bilan du dépôt (aucun envoi)`}</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              <li>{t`Adresses reçues : ${importStats.received}`}</li>
              <li>{t`Nouvelles, en attente de revue : ${importStats.pendingConfirmation}`}</li>
              <li>{t`Déjà abonnées : ${importStats.alreadySubscribed}`}</li>
              <li>{t`En opposition : ${importStats.suppressed}`}</li>
              <li>{t`Doublons dans le fichier : ${importStats.duplicates}`}</li>
              <li>{t`Non exploitables : ${importStats.invalid}`}</li>
            </ul>
            {importStats.truncated && (
              <p className="mt-2 text-destructive">
                {t`Fichier tronqué : seule une partie des lignes a été analysée.`}
              </p>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvFile}
          className="hidden"
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-2xl p-8 text-center transition-all bg-muted/20 flex flex-col items-center justify-center gap-3 border-2 border-dashed ${
            declarationsComplete
              ? 'border-border/80 hover:border-primary/60 hover:bg-muted/40 cursor-pointer'
              : 'border-border/40 opacity-60 cursor-not-allowed'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            {csvLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {csvLoading
                ? t`Analyse du fichier en cours...`
                : declarationsComplete
                  ? t`Cliquez pour choisir votre fichier CSV`
                  : t`Complétez les déclarations de provenance ci-dessus`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t`Formats supportés : Substack subscribers.csv, Beehiiv exports, Ghost CSV`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t`Aucun email n'est envoyé et aucun contact n'est créé à cette étape.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
