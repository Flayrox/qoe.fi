'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, ExternalLink, Search, Shield } from 'lucide-react';
import { updateCreatorApiAccessAction } from '@qoe/sdk/actions/admin';

export interface ApiApplicant {
  id: string;
  name: string | null;
  email: string;
  subdomain: string | null;
  apiAccessStatus: string;
  apiApplicationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiRequestsClientProps {
  initialApplicants: ApiApplicant[];
}

export function ApiRequestsClient({ initialApplicants }: ApiRequestsClientProps) {
  const [applicants, setApplicants] = useState<ApiApplicant[]>(initialApplicants);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);

  const handleUpdateStatus = async (
    userId: string,
    newStatus: 'approved' | 'rejected' | 'revoked' | 'none'
  ) => {
    setLoadingId(userId);
    try {
      const res = await updateCreatorApiAccessAction({ userId, status: newStatus });
      if (res.ok) {
        setApplicants(
          applicants.map((app) =>
            app.id === userId ? { ...app, apiAccessStatus: newStatus } : app
          )
        );
        toast.success(`Statut mis à jour avec succès : ${newStatus}`);
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : 'Impossible de mettre à jour le statut.'
      );
    } finally {
      setLoadingId(null);
    }
  };

  // Filter and search logic
  const filteredApplicants = applicants.filter((app) => {
    const matchesStatus = filterStatus === 'all' || app.apiAccessStatus === filterStatus;
    const matchesSearch =
      (app.name && app.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      app.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.subdomain && app.subdomain.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-8 text-foreground font-sans">
      {/* Search & Filter bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'pending', label: 'En attente (Pending)' },
            { id: 'approved', label: 'Approuvés' },
            { id: 'rejected', label: 'Rejetés' },
            { id: 'revoked', label: 'Révoqués' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
                filterStatus === tab.id
                  ? 'bg-[#EE4B2B] text-white border-[#EE4B2B] shadow-sm'
                  : 'bg-white text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher un créateur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-white border border-border rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:border-[#EE4B2B] focus:ring-[#EE4B2B]/20 transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Grid or Table */}
      <div className="bg-white border border-border rounded-3xl overflow-hidden shadow-sm">
        {filteredApplicants.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground space-y-3">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-semibold">Aucune demande trouvée</p>
            <p className="text-xs text-muted-foreground">
              Ajustez vos filtres ou effectuez une autre recherche.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-muted border-b border-border text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <th className="px-6 py-4">Créateur</th>
                  <th className="px-6 py-4">Espace (Subdomain)</th>
                  <th className="px-6 py-4">Cas d'usage</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence mode="popLayout">
                  {filteredApplicants.map((app) => (
                    <motion.tr
                      key={app.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-muted/50 transition-colors align-top"
                    >
                      {/* Creator Identity */}
                      <td className="px-6 py-5">
                        <div className="space-y-0.5">
                          <span className="font-bold text-foreground block">
                            {app.name || 'Créateur Sans Nom'}
                          </span>
                          <span className="text-[11px] text-muted-foreground block font-mono">
                            {app.email}
                          </span>
                        </div>
                      </td>

                      {/* Subdomain */}
                      <td className="px-6 py-5">
                        {app.subdomain ? (
                          <a
                            href={`https://${app.subdomain}.qoe.fi`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-muted-foreground hover:text-[#EE4B2B] hover:underline flex items-center gap-1 inline-flex"
                          >
                            {app.subdomain}.qoe.fi
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">Aucun</span>
                        )}
                      </td>

                      {/* Usage Justification */}
                      <td className="px-6 py-5 max-w-sm">
                        {app.apiApplicationReason ? (
                          <div className="space-y-2">
                            <p
                              className={`text-muted-foreground leading-relaxed font-mono text-[11px] ${
                                expandedReasonId === app.id ? '' : 'line-clamp-2'
                              }`}
                            >
                              {app.apiApplicationReason}
                            </p>
                            <button
                              onClick={() =>
                                setExpandedReasonId(expandedReasonId === app.id ? null : app.id)
                              }
                              className="text-[10px] font-bold text-[#EE4B2B] hover:underline flex items-center gap-0.5"
                            >
                              {expandedReasonId === app.id ? 'Replier' : "Voir tout l'usage"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Pas de cas d'usage fourni
                          </span>
                        )}
                      </td>

                      {/* Access Status Badge */}
                      <td className="px-6 py-5">
                        <div className="pt-0.5">
                          {app.apiAccessStatus === 'none' && (
                            <span className="bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full font-semibold text-[10px]">
                              None
                            </span>
                          )}
                          {app.apiAccessStatus === 'pending' && (
                            <span className="bg-highlight/10 text-highlight border border-highlight/50 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 inline-flex">
                              <span className="w-1 h-1 rounded-full bg-highlight animate-pulse" />
                              Pending
                            </span>
                          )}
                          {app.apiAccessStatus === 'approved' && (
                            <span className="bg-success/10 text-success border border-success/50 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 inline-flex">
                              <span className="w-1 h-1 rounded-full bg-success" />
                              Approved
                            </span>
                          )}
                          {app.apiAccessStatus === 'rejected' && (
                            <span className="bg-destructive/10 text-destructive border border-destructive/50 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              Rejected
                            </span>
                          )}
                          {app.apiAccessStatus === 'revoked' && (
                            <span className="bg-destructive/10 text-destructive border border-destructive/50 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 inline-flex">
                              Revoked
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Interactive Management Buttons */}
                      <td className="px-6 py-4 text-right">
                        {loadingId === app.id ? (
                          <div className="flex justify-end pr-4">
                            <Loader2 className="w-4 h-4 animate-spin text-[#EE4B2B]" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Actions when Pending */}
                            {app.apiAccessStatus === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(app.id, 'approved')}
                                  className="bg-success hover:bg-success text-white font-semibold px-3 py-1.5 rounded-xl shadow-sm transition-all"
                                >
                                  Approuver
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(app.id, 'rejected')}
                                  className="bg-destructive/10 hover:bg-destructive/10 text-destructive font-semibold px-3 py-1.5 rounded-xl transition-all"
                                >
                                  Refuser
                                </button>
                              </>
                            )}

                            {/* Actions when Approved */}
                            {app.apiAccessStatus === 'approved' && (
                              <button
                                onClick={() => handleUpdateStatus(app.id, 'revoked')}
                                className="bg-muted hover:bg-destructive/10 hover:text-destructive border border-border text-muted-foreground font-semibold px-3 py-1.5 rounded-xl transition-all"
                              >
                                Révoquer l'accès
                              </button>
                            )}

                            {/* Actions when Rejected, Revoked or None */}
                            {(app.apiAccessStatus === 'rejected' ||
                              app.apiAccessStatus === 'revoked' ||
                              app.apiAccessStatus === 'none') && (
                              <button
                                onClick={() => handleUpdateStatus(app.id, 'approved')}
                                className="bg-foreground hover:bg-secondary text-background font-semibold px-3 py-1.5 rounded-xl shadow-sm transition-all"
                              >
                                Activer l'accès API
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
