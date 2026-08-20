'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, KeyRound, Globe } from 'lucide-react';
import { updateOAuthClientStatusAction } from '@qoe/api-client/actions/admin';

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

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-highlight/10 text-highlight border-highlight/50' },
  APPROVED: { label: 'Approved', className: 'bg-success/10 text-success border-success/50' },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-destructive/10 text-destructive border-destructive/50',
  },
  REVOKED: {
    label: 'Revoked',
    className: 'bg-destructive/10 text-destructive border-destructive/50',
  },
};

export function OAuthAppsClient({ initialClients }: { initialClients: OAuthClientAdmin[] }) {
  const [clients, setClients] = useState<OAuthClientAdmin[]>(initialClients);
  const [filter, setFilter] = useState<string>('all');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleStatus = async (id: string, status: 'APPROVED' | 'REJECTED' | 'REVOKED') => {
    setLoadingId(id);
    try {
      const res = await updateOAuthClientStatusAction({ clientId: id, status });
      if (res.ok) {
        setClients((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
        toast.success(
          `Application ${status === 'APPROVED' ? 'approuvée' : status === 'REJECTED' ? 'rejetée' : 'révoquée'}.`
        );
      } else {
        toast.error(res.error?.message ?? 'Mise à jour impossible.');
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
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'Tous' },
          { id: 'PENDING', label: 'En attente' },
          { id: 'APPROVED', label: 'Approuvées' },
          { id: 'REJECTED', label: 'Rejetées' },
          { id: 'REVOKED', label: 'Révoquées' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`text-xs font-semibold px-4 py-2 rounded-full border transition-all cursor-pointer ${
              filter === tab.id
                ? 'bg-[#EE4B2B] text-white border-[#EE4B2B] shadow-sm'
                : 'bg-white text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-border rounded-3xl overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground space-y-3">
            <ShieldCheck className="w-10 h-10 mx-auto" />
            <p className="text-sm font-semibold">Aucune application OAuth</p>
            <p className="text-xs">
              Les applications créées par les développeurs apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-muted border-b border-border text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <th className="px-6 py-4">Application</th>
                  <th className="px-6 py-4">Développeur</th>
                  <th className="px-6 py-4">Type & Scopes</th>
                  <th className="px-6 py-4">Redirect URIs</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const meta = STATUS_META[c.status] ?? STATUS_META.PENDING;
                  return (
                    <tr key={c.id} className="hover:bg-muted/50 transition-colors align-top">
                      <td className="px-6 py-5">
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
                      </td>
                      <td className="px-6 py-5">
                        <span className="font-semibold block">{c.ownerName || '—'}</span>
                        <span className="text-[11px] text-muted-foreground font-mono block">
                          {c.ownerEmail}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-1.5 mb-2">
                          {c.clientType === 'CONFIDENTIAL' ? (
                            <KeyRound className="w-3 h-3 text-muted-foreground" />
                          ) : (
                            <Globe className="w-3 h-3 text-muted-foreground" />
                          )}
                          <span className="font-semibold">
                            {c.clientType === 'CONFIDENTIAL' ? 'Confidentielle' : 'Publique'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {c.scopes.map((s) => (
                            <span
                              key={s}
                              className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground border border-border/40"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5 max-w-xs">
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
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {loadingId === c.id ? (
                          <div className="flex justify-end pr-4">
                            <Loader2 className="w-4 h-4 animate-spin text-[#EE4B2B]" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {(c.status === 'PENDING' ||
                              c.status === 'REJECTED' ||
                              c.status === 'REVOKED') && (
                              <button
                                onClick={() => handleStatus(c.id, 'APPROVED')}
                                className="bg-success hover:bg-success/90 text-white font-semibold px-3 py-1.5 rounded-xl shadow-sm transition-all cursor-pointer"
                              >
                                Approuver
                              </button>
                            )}
                            {c.status === 'PENDING' && (
                              <button
                                onClick={() => handleStatus(c.id, 'REJECTED')}
                                className="bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                              >
                                Rejeter
                              </button>
                            )}
                            {c.status === 'APPROVED' && (
                              <button
                                onClick={() => handleStatus(c.id, 'REVOKED')}
                                className="bg-muted hover:bg-destructive/10 hover:text-destructive border border-border text-muted-foreground font-semibold px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                              >
                                Révoquer
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
