'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  Rss,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { importSubscribersCsvAction, importRssFeedAction } from './actions';
import { t } from '@lingui/core/macro';

export default function CreatorImportPage() {
  const [activeTab, setActiveTab] = useState<'csv' | 'rss'>('csv');
  const [csvContent, setCsvContent] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMessage] = useState<string | null>(null);

  const handleCsvImport = async () => {
    if (!csvContent.trim()) {
      setErrorMessage("Veuillez d'abord coller ou charger un fichier CSV.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await importSubscribersCsvAction(csvContent);
    setLoading(false);

    if (res.success) {
      setSuccessMessage(`✅ Succès ! ${res.count} abonnés ont été importés dans votre audience.`);
      setCsvContent('');
    } else {
      setErrorMessage(res.error || "Une erreur est survenue lors de l'importation.");
    }
  };

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvContent(text);
      }
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
          Migrez instantanément vos abonnés et l'intégralité de vos publications passées sans perdre
          un seul lecteur.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/40 mb-8 gap-6">
        <button
          onClick={() => {
            setActiveTab('csv');
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className={`pb-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'csv'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{t`Importer Abonnés (CSV)`}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('rss');
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className={`pb-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'rss'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Rss className="w-4 h-4" />
          <span>Importer Articles (RSS / Substack)</span>
        </button>
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

      {/* CSV TAB */}
      {activeTab === 'csv' && (
        <div className="bg-card border border-border/40 rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-bold mb-2">Importation de la liste d'abonnés</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Exportez votre fichier CSV depuis Substack (Réglages {'>'} Exportation) ou Ghost et
            importez-le ci-dessous.
          </p>

          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Charger un fichier .csv
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Ou collez directement le texte CSV
            </label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="email,created_at&#10;jean@example.com,2026-01-01&#10;sophie@example.com,2026-02-01"
              rows={8}
              className="w-full p-4 rounded-2xl bg-muted/40 border border-border/40 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <button
            onClick={handleCsvImport}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Lancer l'importation de l'audience</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* RSS TAB */}
      {activeTab === 'rss' && (
        <div className="bg-card border border-border/40 rounded-3xl p-8 shadow-sm">
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
              placeholder="https://macha.substack.com/feed"
              className="w-full p-4 rounded-2xl bg-muted/40 border border-border/40 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <button
            onClick={handleRssImport}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
      )}
    </div>
  );
}
