'use client';

import React, { useState } from 'react';
import { Users, Search, Download, Zap, Mail, CreditCard } from 'lucide-react';

export interface SubscriberItem {
  id: string;
  email: string;
  isActive: boolean;
  isPremium: boolean;
  ltvCents: number;
  createdAt: string;
}

interface AudienceClientProps {
  initialSubscribers: SubscriberItem[];
}

export function AudienceClient({ initialSubscribers }: AudienceClientProps) {
  const [subscribers] = useState<SubscriberItem[]>(initialSubscribers);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'free' | 'premium'>('all');

  // Filter subscribers based on search and type
  const filteredSubscribers = subscribers.filter((sub) => {
    const matchesSearch = sub.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterType === 'free') return !sub.isPremium;
    if (filterType === 'premium') return sub.isPremium;
    return true;
  });

  const totalSubscribers = subscribers.length;
  const premiumCount = subscribers.filter((s) => s.isPremium).length;
  const freeCount = totalSubscribers - premiumCount;
  const totalLtvEur = (subscribers.reduce((acc, s) => acc + s.ltvCents, 0) / 100).toFixed(2);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Email', 'Statut', 'Formule', 'Revenu LTV (EUR)', 'Date Inscription'];
    const rows = filteredSubscribers.map((s) => [
      s.email,
      s.isActive ? 'Actif' : 'Inactif',
      s.isPremium ? 'Premium' : 'Gratuit',
      (s.ltvCents / 100).toFixed(2),
      new Date(s.createdAt).toLocaleDateString('fr-FR'),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `subscribers_qoe_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/30">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Users className="h-4 w-4 text-primary stroke-[1.5]" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Gestion d'audience
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Mon Audience & Abonnés
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez vos lecteurs, vos abonnés à la newsletter et vos membres Premium
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={subscribers.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border/40 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors self-start sm:self-auto disabled:opacity-50"
        >
          <Download className="h-4 w-4 stroke-[1.5]" />
          <span>Exporter en CSV</span>
        </button>
      </div>

      {/* ─── KPI Cards Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Total Abonnés
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Users className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {totalSubscribers.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Lecteurs inscrits au réseau</p>
        </div>

        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Formule Premium
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {premiumCount.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{freeCount} abonnés gratuits</p>
        </div>

        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Revenu LTV Cumulé
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <CreditCard className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{totalLtvEur} €</div>
          <p className="text-xs text-muted-foreground mt-2">Valeur totale générée par l'audience</p>
        </div>
      </div>

      {/* ─── Search & Filters Bar ───────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground stroke-[1.5]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un e-mail..."
            className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-border/30 rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border/30 w-full sm:w-auto">
          {(
            [
              { id: 'all', label: `Tous (${totalSubscribers})` },
              { id: 'free', label: `Gratuits (${freeCount})` },
              { id: 'premium', label: `Premium (${premiumCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterType === tab.id
                  ? 'bg-card text-foreground font-semibold shadow-sm border border-border/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Subscribers Table ──────────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card overflow-hidden shadow-none">
        {filteredSubscribers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg border-border/30 bg-muted/10 m-6">
            <Mail className="h-8 w-8 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-foreground">Aucun abonné trouvé</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {searchQuery
                ? 'Aucun abonné ne correspond à votre recherche.'
                : "Les personnes qui s'abonnent à votre espace apparaîtront ici."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/30 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Abonné</th>
                  <th className="py-3.5 px-6">Statut</th>
                  <th className="py-3.5 px-6">Formule</th>
                  <th className="py-3.5 px-6">LTV</th>
                  <th className="py-3.5 px-6 text-right">Inscrit le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 text-foreground font-medium">
                {filteredSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold uppercase text-xs">
                          {sub.email.substring(0, 2)}
                        </div>
                        <span className="font-semibold text-foreground">{sub.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${sub.isActive ? 'bg-success' : 'bg-muted-foreground'}`}
                        />
                        <span className="text-muted-foreground">
                          {sub.isActive ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {sub.isPremium ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-semibold text-[11px]">
                          <Zap className="h-3 w-3 stroke-[1.5]" /> Premium
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium text-[11px]">
                          Gratuit
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-semibold">{(sub.ltvCents / 100).toFixed(2)} €</td>
                    <td className="py-4 px-6 text-right text-muted-foreground">
                      {new Date(sub.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
