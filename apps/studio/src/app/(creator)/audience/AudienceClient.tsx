'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
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
              Gestion d&apos;audience
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Mon Audience & Abonnés
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez vos lecteurs, vos abonnés à la newsletter et vos membres Premium
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={subscribers.length === 0}
          className="self-start sm:self-auto"
        >
          <Download />
          <span>Exporter en CSV</span>
        </Button>
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success-text">
              <CreditCard className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{totalLtvEur} €</div>
          <p className="text-xs text-muted-foreground mt-2">
            Valeur totale générée par l&apos;audience
          </p>
        </div>
      </div>

      {/* ─── Search & Filters Bar ───────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground stroke-[1.5]" />
          <Input
            type="text"
            size="sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un e-mail..."
            className="pl-9"
          />
        </div>

        <Tabs
          variant="segmented"
          size="sm"
          selectedKey={filterType}
          onSelectionChange={(key) => setFilterType(String(key) as 'all' | 'free' | 'premium')}
          className="w-full sm:w-auto"
        >
          <TabList aria-label="Filtrer par formule" className="w-full sm:w-auto">
            <Tab id="all" count={totalSubscribers}>
              Tous
            </Tab>
            <Tab id="free" count={freeCount}>
              Gratuits
            </Tab>
            <Tab id="premium" count={premiumCount}>
              Premium
            </Tab>
          </TabList>
        </Tabs>
      </div>

      {/* ─── Subscribers Table ──────────────────────────────────── */}
      {filteredSubscribers.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card overflow-hidden shadow-none">
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg border-border/30 bg-muted/10 m-6">
            <Mail className="h-8 w-8 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-foreground">Aucun abonné trouvé</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {searchQuery
                ? 'Aucun abonné ne correspond à votre recherche.'
                : t`Les personnes qui s'abonnent à votre espace apparaîtront ici.`}
            </p>
          </div>
        </div>
      ) : (
        <Table aria-label="Liste des abonnés" size="md">
          <TableHeader>
            <TableColumn isRowHeader>Abonné</TableColumn>
            <TableColumn>Statut</TableColumn>
            <TableColumn>Formule</TableColumn>
            <TableColumn>LTV</TableColumn>
            <TableColumn className="text-right">Inscrit le</TableColumn>
          </TableHeader>
          <TableBody items={filteredSubscribers}>
            {(sub) => (
              <TableRow id={sub.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold uppercase text-xs">
                      {sub.email.substring(0, 2)}
                    </div>
                    <span className="font-semibold text-foreground">{sub.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="soft" dot tone={sub.isActive ? 'success' : 'neutral'} size="xs">
                    {sub.isActive ? 'Actif' : 'Inactif'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {sub.isPremium ? (
                    <Badge variant="soft" tone="brand" size="xs">
                      <Zap />
                      Premium
                    </Badge>
                  ) : (
                    <Badge variant="soft" tone="neutral" size="xs">
                      Gratuit
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-semibold">{(sub.ltvCents / 100).toFixed(2)} €</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {new Date(sub.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
