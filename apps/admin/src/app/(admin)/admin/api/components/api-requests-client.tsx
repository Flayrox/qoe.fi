'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@qoe/ui/toast';
import {
  Loader2,
  ExternalLink,
  Search,
  Shield,
  Settings2,
  X,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  KeyRound,
  Globe,
} from 'lucide-react';
import { updateCreatorApiAccessAction, updateCreatorApiGrantsAction } from '@qoe/sdk/actions/admin';

export interface ApiApplicant {
  id: string;
  name: string | null;
  email: string;
  subdomain: string | null;
  apiAccessStatus: string;
  apiGrants: string[];
  apiApplicationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiModule {
  key: string;
  label: string;
  description: string;
  category: string;
  enabled: boolean;
}

interface ApiRequestsClientProps {
  initialApplicants: ApiApplicant[];
  modules: ApiModule[];
}

// Icône par catégorie (API entrante / sortante / OAuth).
const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  api: { label: 'API entrante', icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
  webhooks: { label: 'API sortante', icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
  oauth: { label: 'OAuth / OIDC', icon: <KeyRound className="w-3.5 h-3.5" /> },
};

function moduleLabel(key: string, modules: ApiModule[]): string {
  return modules.find((m) => m.key === key)?.label ?? key;
}

export function ApiRequestsClient({ initialApplicants, modules }: ApiRequestsClientProps) {
  const [applicants, setApplicants] = useState<ApiApplicant[]>(initialApplicants);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);

  // Modal d'attribution des permissions (approbation ou ajustement).
  const [picker, setPicker] = useState<{ userId: string; status: string; grants: string[] } | null>(
    null
  );

  const grantableModules = modules.filter((m) => m.enabled);

  const applyStatus = (userId: string, patch: Partial<ApiApplicant>) => {
    setApplicants((prev) => prev.map((app) => (app.id === userId ? { ...app, ...patch } : app)));
  };

  // Approbation / activation avec le choix des permissions par l'admin.
  const handleApprove = async (userId: string, grants: string[]) => {
    setLoadingId(userId);
    try {
      const res = await updateCreatorApiAccessAction({ userId, status: 'approved', grants });
      if (res.ok) {
        applyStatus(userId, { apiAccessStatus: 'approved', apiGrants: grants });
        toast.success('Accès API accordé avec les permissions sélectionnées.');
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Impossible d’accorder l’accès API.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleUpdateStatus = async (userId: string, newStatus: 'rejected' | 'revoked' | 'none') => {
    setLoadingId(userId);
    try {
      const res = await updateCreatorApiAccessAction({ userId, status: newStatus });
      if (res.ok) {
        applyStatus(userId, { apiAccessStatus: newStatus, apiGrants: [] });
        toast.success(
          newStatus === 'revoked'
            ? 'Accès révoqué : toutes les permissions ont été retirées.'
            : 'Statut mis à jour.'
        );
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : 'Impossible de mettre à jour le statut.'
      );
    } finally {
      setLoadingId(null);
    }
  };

  // Ajustement des permissions d'un créateur déjà approuvé (sans toucher au statut).
  const handleUpdateGrants = async (userId: string, grants: string[]) => {
    setLoadingId(userId);
    try {
      const res = await updateCreatorApiGrantsAction({ userId, grants });
      if (res.ok) {
        applyStatus(userId, { apiGrants: grants });
        toast.success('Permissions mises à jour.');
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : 'Impossible de mettre à jour les permissions.'
      );
    } finally {
      setLoadingId(null);
    }
  };

  const openPicker = (app: ApiApplicant, status: string) => {
    // Au moment d'accorder l'accès : présélection de tous les modules actifs.
    const grants =
      status === 'approved'
        ? grantableModules.map((m) => m.key)
        : app.apiGrants.length > 0
          ? app.apiGrants
          : grantableModules.map((m) => m.key);
    setPicker({ userId: app.id, status, grants });
  };

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
                  <th className="px-6 py-4">Permissions accordées</th>
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

                      {/* Granted permissions (modular) */}
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                          {app.apiGrants.length === 0 ? (
                            <span className="text-muted-foreground italic text-[11px]">
                              Aucune permission
                            </span>
                          ) : (
                            app.apiGrants.map((g) => {
                              const meta =
                                CATEGORY_META[modules.find((m) => m.key === g)?.category ?? ''];
                              return (
                                <span
                                  key={g}
                                  title={moduleLabel(g, modules)}
                                  className="bg-primary/5 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-semibold text-[10px] inline-flex items-center gap-1"
                                >
                                  {meta?.icon ?? <Globe className="w-3 h-3" />}
                                  {moduleLabel(g, modules)}
                                </span>
                              );
                            })
                          )}
                        </div>
                        {app.apiAccessStatus === 'approved' && (
                          <button
                            onClick={() => openPicker(app, 'edit')}
                            className="mt-2 text-[10px] font-bold text-muted-foreground hover:text-[#EE4B2B] flex items-center gap-1"
                          >
                            <Settings2 className="w-3 h-3" />
                            Modifier les permissions
                          </button>
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
                                  onClick={() => openPicker(app, 'approved')}
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
                                onClick={() => openPicker(app, 'approved')}
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

      {/* Permission picker modal */}
      <AnimatePresence>
        {picker && (
          <PermissionPicker
            modules={modules}
            initialGrants={picker.grants}
            isApproval={picker.status === 'approved'}
            onClose={() => setPicker(null)}
            onConfirm={(grants) => {
              if (picker.status === 'approved') {
                void handleApprove(picker.userId, grants);
              } else {
                void handleUpdateGrants(picker.userId, grants);
              }
              setPicker(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface PermissionPickerProps {
  modules: ApiModule[];
  initialGrants: string[];
  isApproval: boolean;
  onClose: () => void;
  onConfirm: (grants: string[]) => void;
}

// Modale « Accorder l'accès API » : l'admin choisit, permission par permission,
// ce qu'il accorde (API entrante lecture/écriture/analytics, API sortante
// webhooks, OAuth) — il se réserve ainsi le droit de ne pas tout donner.
function PermissionPicker({
  modules,
  initialGrants,
  isApproval,
  onClose,
  onConfirm,
}: PermissionPickerProps) {
  const [grants, setGrants] = useState<string[]>(initialGrants);
  const active = modules.filter((m) => m.enabled);

  const toggle = (key: string) => {
    setGrants((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const categories = [...new Set(active.map((m) => m.category))];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {isApproval ? "Accorder l'accès API" : 'Modifier les permissions'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {isApproval
                ? 'Sélectionnez les permissions à accorder à ce créateur. Vous pourrez les ajuster à tout moment.'
                : "Ajustez les permissions de ce créateur sans changer son statut (l'admin se réserve le droit)."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {CATEGORY_META[cat]?.icon}
                {CATEGORY_META[cat]?.label ?? cat}
              </div>
              <div className="space-y-2">
                {active
                  .filter((m) => m.category === cat)
                  .map((m) => {
                    const checked = grants.includes(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggle(m.key)}
                        className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                          checked
                            ? 'border-[#EE4B2B]/50 bg-[#EE4B2B]/5'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            checked
                              ? 'bg-[#EE4B2B] border-[#EE4B2B] text-white'
                              : 'border-muted-foreground/40 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="space-y-0.5">
                          <span className="block text-xs font-bold text-foreground">{m.label}</span>
                          <span className="block text-[11px] text-muted-foreground leading-snug">
                            {m.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <button
            onClick={() => setGrants(active.map((m) => m.key))}
            className="text-[11px] font-bold text-[#EE4B2B] hover:underline"
          >
            Tout sélectionner
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => onConfirm(grants)}
              disabled={grants.length === 0}
              className="px-4 py-2 rounded-xl bg-[#EE4B2B] text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isApproval ? 'Accorder l’accès' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
