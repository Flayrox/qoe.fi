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
import { importRssFeedAction, importSubscribersCsvAction } from './actions';
import { t } from '@lingui/core/macro';

export default function CreatorImportPage() {
  const [rssUrl, setRssUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [successMsg, setSuccessMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    setCsvLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const res = await importSubscribersCsvAction(content);
      setCsvLoading(false);
      if (res.success) {
        setSuccessMessage(`🎉 Succès ! ${res.count} abonnés ont été importés dans votre audience.`);
      } else {
        setErrorMessage(res.error || "Impossible d'importer les abonnés.");
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
        <h2 className="text-xl font-bold mb-2">{t`Importer vos abonnés (Substack, Beehiiv, Ghost)`}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t`Déposez votre fichier `}
          <code className="text-foreground font-semibold">subscribers.csv</code>
          {t` exporté depuis votre ancienne plateforme. Les adresses valides seront immédiatement rattachées à votre publication.`}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvFile}
          className="hidden"
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-2xl p-8 text-center cursor-pointer transition-all bg-muted/20 hover:bg-muted/40 flex flex-col items-center justify-center gap-3"
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
                ? t`Traitement et importation en cours...`
                : t`Cliquez pour choisir votre fichier CSV`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t`Formats supportés : Substack subscribers.csv, Beehiiv exports, Ghost CSV`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
