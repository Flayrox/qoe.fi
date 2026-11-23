'use client';

import { StudioHeader } from '@/components/studio-page';

import React, { useEffect, useState, useMemo } from 'react';
import { t } from '@lingui/core/macro';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TableSelectAllCell,
  TableSelectionCell,
  TablePersonCell,
  selectionToKeySet,
  sortRows,
  type SortDescriptorLike,
  type SortSpec,
} from '@qoe/ui/table';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import {
  AlertCircle,
  Users,
  Search,
  Download,
  Zap,
  Mail,
  CreditCard,
  X,
  CheckSquare,
} from 'lucide-react';

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
  /** Lecture analytics indisponible : la liste vide est expliquée, pas tacite. */
  unavailable?: boolean;
}

type FilterTab = 'all' | 'active' | 'premium' | 'free' | 'inactive';

const SUBSCRIBER_SORT: SortSpec<SubscriberItem> = {
  person: { kind: 'text', value: (row) => row.email },
  status: {
    kind: 'rank',
    rank: [t`Actif`, t`Inactif`],
    value: (row) => (row.isActive ? t`Actif` : t`Inactif`),
  },
  plan: {
    kind: 'rank',
    rank: [t`Premium`, t`Gratuit`],
    value: (row) => (row.isPremium ? t`Premium` : t`Gratuit`),
  },
  ltv: { kind: 'number', value: (row) => row.ltvCents },
  createdAt: { kind: 'date', value: (row) => new Date(row.createdAt) },
};

export function AudienceClient({ initialSubscribers, unavailable = false }: AudienceClientProps) {
  const [subscribers] = useState<SubscriberItem[]>(initialSubscribers);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterTab>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptorLike>({
    column: 'createdAt',
    direction: 'descending',
  });

  // Totaux statistiques
  const totalSubscribers = subscribers.length;
  const activeCount = useMemo(() => subscribers.filter((s) => s.isActive).length, [subscribers]);
  const inactiveCount = totalSubscribers - activeCount;
  const premiumCount = useMemo(() => subscribers.filter((s) => s.isPremium).length, [subscribers]);
  const freeCount = totalSubscribers - premiumCount;
  const totalLtvEur = (subscribers.reduce((acc, s) => acc + s.ltvCents, 0) / 100).toFixed(2);

  // Filtrage
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !sub.email.toLowerCase().includes(q)) return false;

      if (filterType === 'active') return sub.isActive;
      if (filterType === 'inactive') return !sub.isActive;
      if (filterType === 'premium') return sub.isPremium;
      if (filterType === 'free') return !sub.isPremium;
      return true;
    });
  }, [subscribers, searchQuery, filterType]);

  // Tri
  const sortedSubscribers = useMemo(() => {
    return sortRows(filteredSubscribers, sortDescriptor, SUBSCRIBER_SORT);
  }, [filteredSubscribers, sortDescriptor]);

  // Export CSV (tout ou sélection)
  const handleExportCSV = (onlySelected = false) => {
    const listToExport = onlySelected
      ? subscribers.filter((s) => selectedKeys.has(s.id))
      : filteredSubscribers;

    if (listToExport.length === 0) return;

    const headers = [t`Email`, t`Statut`, t`Formule`, 'Revenu LTV (EUR)', 'Date Inscription'];
    const rows = listToExport.map((s) => [
      s.email,
      s.isActive ? t`Actif` : t`Inactif`,
      s.isPremium ? t`Premium` : t`Gratuit`,
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

  // Une ligne filtrée sort de la table : la garder sélectionnée rendrait la
  // barre d'actions (et l'export de sélection) menteuse.
  useEffect(() => {
    setSelectedKeys(new Set());
  }, [searchQuery, filterType]);

  const hasSelection = selectedKeys.size > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <StudioHeader
        title={t`Audience`}
        description={t`Lecteurs, abonnés à la newsletter et membres premium.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportCSV(false)}
            disabled={filteredSubscribers.length === 0}
          >
            <Download />
            <span>
              {t`Exporter (`}
              {filteredSubscribers.length})
            </span>
          </Button>
        }
      />

      {unavailable ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={1.8}
          />
          <div className="min-w-0 text-xs leading-relaxed">
            <p className="font-semibold text-foreground">
              {t`Statistiques d’audience momentanément indisponibles`}
            </p>
            <p className="text-muted-foreground">
              {t`La liste ci-dessous est vide parce que le service d’analytics ne répond pas — pas parce que vous n’avez aucun abonné. Rechargez la page dans quelques instants.`}
            </p>
          </div>
        </div>
      ) : null}

      {/* ─── KPI Cards Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              {t`Total Abonnés`}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Users className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {totalSubscribers.toLocaleString('fr-FR')}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {activeCount.toLocaleString('fr-FR')} {t`actifs ·`} {inactiveCount} inactifs
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              {t`Formule Premium`}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {premiumCount.toLocaleString('fr-FR')}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {freeCount.toLocaleString('fr-FR')} {t`abonnés gratuits`}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              {t`Revenu LTV Cumulé`}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success-text">
              <CreditCard className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{totalLtvEur} €</div>
          <p className="text-xs text-muted-foreground mt-2">
            {t`Valeur totale générée par l'audience`}
          </p>
        </div>
      </div>

      {/* ─── Search & Filters Bar ───────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground stroke-[1.5]" />
          <Input
            type="text"
            size="sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t`Rechercher par adresse email...`}
            className="pl-9"
          />
        </div>

        <Tabs
          variant="segmented"
          size="sm"
          selectedKey={filterType}
          onSelectionChange={(key) => setFilterType(String(key) as FilterTab)}
          className="w-full md:w-auto"
        >
          <TabList aria-label={t`Filtrer l'audience`} className="w-full md:w-auto">
            <Tab id="all" count={totalSubscribers}>
              {t`Tous`}
            </Tab>
            <Tab id="active" count={activeCount}>
              {t`Actifs`}
            </Tab>
            <Tab id="premium" count={premiumCount}>
              {t`Premium`}
            </Tab>
            <Tab id="free" count={freeCount}>
              {t`Gratuits`}
            </Tab>
            <Tab id="inactive" count={inactiveCount}>
              {t`Inactifs`}
            </Tab>
          </TabList>
        </Tabs>
      </div>

      {/* ─── Bulk Action Floating Bar ────────────────────────────── */}
      {hasSelection && (
        <div className="sticky top-4 z-20 flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-popover/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {selectedKeys.size > 1
                ? t`${selectedKeys.size} abonnés sélectionnés`
                : t`${selectedKeys.size} abonné sélectionné`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" onClick={() => handleExportCSV(true)}>
              <Download />
              <span>{t`Exporter la sélection`}</span>
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setSelectedKeys(new Set())}>
              <X />
              <span>{t`Désélectionner`}</span>
            </Button>
          </div>
        </div>
      )}

      {/* ─── Subscribers Table ──────────────────────────────────── */}
      {sortedSubscribers.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card overflow-hidden shadow-none">
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg border-border/30 bg-muted/10 m-6">
            <Mail className="h-8 w-8 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-foreground">{t`Aucun abonné trouvé`}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {searchQuery
                ? t`Aucun abonné ne correspond à votre recherche.`
                : t`Les personnes qui s'abonnent à votre espace apparaîtront ici.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/30 bg-card shadow-none">
          <Table
            aria-label={t`Liste des abonnés`}
            size="md"
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={(keys) =>
              setSelectedKeys(
                selectionToKeySet(
                  keys,
                  sortedSubscribers.map((sub) => sub.id)
                )
              )
            }
            sortDescriptor={sortDescriptor}
            onSortChange={setSortDescriptor}
          >
            <TableHeader>
              <TableSelectAllCell />
              <TableColumn id="person" isRowHeader allowsSorting>
                {t`Abonné`}
              </TableColumn>
              <TableColumn id="status" allowsSorting>
                {t`Statut`}
              </TableColumn>
              <TableColumn id="plan" allowsSorting>
                {t`Formule`}
              </TableColumn>
              <TableColumn id="ltv" allowsSorting>
                {t`Revenu LTV`}
              </TableColumn>
              <TableColumn id="createdAt" allowsSorting className="text-right">
                {t`Inscrit le`}
              </TableColumn>
            </TableHeader>
            <TableBody items={sortedSubscribers}>
              {(sub) => (
                <TableRow id={sub.id}>
                  <TableSelectionCell rowId={sub.id} />
                  <TableCell>
                    <TablePersonCell name={sub.email.split('@')[0]} meta={sub.email} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="soft" dot tone={sub.isActive ? 'success' : 'neutral'} size="xs">
                      {sub.isActive ? t`Actif` : t`Inactif`}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {sub.isPremium ? (
                      <Badge variant="soft" tone="brand" size="xs">
                        <Zap />
                        {t`Premium`}
                      </Badge>
                    ) : (
                      <Badge variant="soft" tone="neutral" size="xs">
                        {t`Gratuit`}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums font-semibold">
                    {(sub.ltvCents / 100).toLocaleString('fr-FR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    €
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
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
        </div>
      )}
    </div>
  );
}
