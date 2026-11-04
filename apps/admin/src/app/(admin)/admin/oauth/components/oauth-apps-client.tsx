'use client';

import React, { useState } from 'react';
import { toast } from '@qoe/ui/toast';
import { Loader2, ShieldCheck, KeyRound, Globe } from 'lucide-react';
import { updateOAuthClientStatusAction } from '@qoe/sdk/actions/admin';
import { attemptWithStepUp, notifyActionFailure, readMessage } from '@/lib/authz-feedback';
import { Tabs, TabList, Tab } from '@qoe/ui/tabs';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@qoe/ui/table';
import { Badge, type BadgeProps } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';

type BadgeTone = NonNullable<BadgeProps['tone']>;

export interface OAuthClientAdmin {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string | null;
  redirectUris: string[];
  scopes: string[];
  clientType: string;
  status: string;
  ownerName: string | null;
  ownerEmail: string;
  ownerUsername: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente', tone: 'brand' },
  APPROVED: { label: 'Approuvée', tone: 'success' },
  REJECTED: { label: 'Rejetée', tone: 'danger' },
  REVOKED: { label: 'Révoquée', tone: 'neutral' },
};

export function OAuthAppsClient({ initialClients }: { initialClients: OAuthClientAdmin[] }) {
  const [clients, setClients] = useState<OAuthClientAdmin[]>(initialClients);
  const [filter, setFilter] = useState<string>('all');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleStatus = async (id: string, status: 'APPROVED' | 'REJECTED' | 'REVOKED') => {
    setLoadingId(id);
    try {
      // Approuver (ou révoquer) une application OAuth ouvre un accès aux données
      // : c'est un acte N2 — un refus propose la vérification d'un facteur, puis
      // l'action est rejouée telle quelle.
      const res = await attemptWithStepUp(() =>
        updateOAuthClientStatusAction({ clientId: id, status })
      );
      if (res.ok) {
        setClients((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
        toast.success(
          `Application ${status === 'APPROVED' ? 'approuvée' : status === 'REJECTED' ? 'rejetée' : 'révoquée'}.`
        );
      } else {
        notifyActionFailure(res, readMessage(res) ?? 'Mise à jour impossible.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setLoadingId(null);
    }
  };

  const filtered = clients.filter((c) => filter === 'all' || c.status === filter);

  return (
    <div className="space-y-6 text-foreground font-sans">
      {/* Filtres */}
      <Tabs variant="segmented" value={filter} onValueChange={setFilter} className="w-fit">
        <TabList aria-label="Statut des applications OAuth">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'PENDING', label: 'En attente' },
            { id: 'APPROVED', label: 'Approuvées' },
            { id: 'REJECTED', label: 'Rejetées' },
            { id: 'REVOKED', label: 'Révoquées' },
          ].map((tab) => (
            <Tab key={tab.id} id={tab.id}>
              {tab.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>

      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground space-y-3">
            <ShieldCheck className="w-10 h-10 mx-auto" />
            <p className="text-sm font-semibold">Aucune application OAuth</p>
            <p className="text-xs">
              Les applications créées par les développeurs apparaîtront ici.
            </p>
          </div>
        ) : (
          <Table aria-label="Applications OAuth" size="md">
            <TableHeader>
              <TableColumn isRowHeader>Application</TableColumn>
              <TableColumn>Développeur</TableColumn>
              <TableColumn>Type & Scopes</TableColumn>
              <TableColumn>Redirect URIs</TableColumn>
              <TableColumn>Statut</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody items={filtered}>
              {(c) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.PENDING;
                return (
                  <TableRow id={c.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <span className="font-bold text-foreground block">{c.name}</span>
                        {c.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {c.description}
                          </p>
                        )}
                        <code className="text-[10px] text-muted-foreground font-mono block truncate">
                          {c.clientId}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold block">{c.ownerName || '—'}</span>
                      <span className="text-[11px] text-muted-foreground font-mono block">
                        {c.ownerEmail}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 mb-2">
                        {c.clientType === 'CONFIDENTIAL' ? (
                          <KeyRound className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <Globe className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className="font-semibold text-xs">
                          {c.clientType === 'CONFIDENTIAL' ? 'Confidentielle' : 'Publique'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {c.scopes.map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            tone="neutral"
                            size="xs"
                            className="font-mono"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="space-y-1">
                        {c.redirectUris.map((uri) => (
                          <p
                            key={uri}
                            className="text-[11px] text-muted-foreground font-mono break-all"
                          >
                            {uri}
                          </p>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="soft" tone={meta.tone} size="sm">
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {loadingId === c.id ? (
                        <div className="flex justify-end pr-4">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {(c.status === 'PENDING' ||
                            c.status === 'REJECTED' ||
                            c.status === 'REVOKED') && (
                            <Button
                              size="xs"
                              variant="solid"
                              tone="brand"
                              onClick={() => handleStatus(c.id, 'APPROVED')}
                            >
                              Approuver
                            </Button>
                          )}
                          {c.status === 'PENDING' && (
                            <Button
                              size="xs"
                              variant="soft"
                              tone="danger"
                              onClick={() => handleStatus(c.id, 'REJECTED')}
                            >
                              Rejeter
                            </Button>
                          )}
                          {c.status === 'APPROVED' && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => handleStatus(c.id, 'REVOKED')}
                            >
                              Révoquer
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              }}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
