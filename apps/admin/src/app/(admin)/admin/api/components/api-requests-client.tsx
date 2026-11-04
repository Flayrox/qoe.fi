'use client';

import React, { useState } from 'react';
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
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Checkbox } from '@qoe/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Input, InputGroup } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { updateCreatorApiAccessAction, updateCreatorApiGrantsAction } from '@qoe/sdk/actions/admin';
import { attemptWithStepUp, notifyActionFailure, readMessage } from '@/lib/authz-feedback';

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
      // Accorder un accès API exige une preuve forte récente (N2) : le refus
      // ouvre la vérification d'un facteur, puis l'action est rejouée.
      const res = await attemptWithStepUp(() =>
        updateCreatorApiAccessAction({ userId, status: 'approved', grants })
      );
      if (res.ok) {
        applyStatus(userId, { apiAccessStatus: 'approved', apiGrants: grants });
        toast.success('Accès API accordé avec les permissions sélectionnées.');
      } else {
        notifyActionFailure(res, readMessage(res) ?? 'Impossible d’accorder l’accès API.');
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
      const res = await attemptWithStepUp(() =>
        updateCreatorApiAccessAction({ userId, status: newStatus })
      );
      if (res.ok) {
        applyStatus(userId, { apiAccessStatus: newStatus, apiGrants: [] });
        toast.success(
          newStatus === 'revoked'
            ? 'Accès révoqué : toutes les permissions ont été retirées.'
            : 'Statut mis à jour.'
        );
      } else {
        notifyActionFailure(res, readMessage(res) ?? 'Impossible de mettre à jour le statut.');
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
      const res = await attemptWithStepUp(() => updateCreatorApiGrantsAction({ userId, grants }));
      if (res.ok) {
        applyStatus(userId, { apiGrants: grants });
        toast.success('Permissions mises à jour.');
      } else {
        notifyActionFailure(
          res,
          readMessage(res) ?? 'Impossible de mettre à jour les permissions.'
        );
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
        <Tabs
          variant="segmented"
          value={filterStatus}
          onValueChange={setFilterStatus}
          className="w-fit"
        >
          <TabList aria-label="Statut des demandes API">
            {[
              { id: 'all', label: 'Tous' },
              { id: 'pending', label: 'En attente' },
              { id: 'approved', label: 'Approuvés' },
              { id: 'rejected', label: 'Rejetés' },
              { id: 'revoked', label: 'Révoqués' },
            ].map((tab) => (
              <Tab key={tab.id} id={tab.id}>
                {tab.label}
              </Tab>
            ))}
          </TabList>
        </Tabs>

        {/* Search input */}
        <div className="max-w-xs w-full">
          <InputGroup size="sm" left={<Search />}>
            <Input
              type="text"
              placeholder="Rechercher un créateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>
        </div>
      </div>

      {/* Table */}
      {filteredApplicants.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-16 text-center text-muted-foreground space-y-3">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold">Aucune demande trouvée</p>
          <p className="text-xs text-muted-foreground">
            Ajustez vos filtres ou effectuez une autre recherche.
          </p>
        </div>
      ) : (
        <Table aria-label="Demandes d'accès API" size="md">
          <TableHeader>
            <TableColumn isRowHeader>Créateur</TableColumn>
            <TableColumn>Espace (Subdomain)</TableColumn>
            <TableColumn>Cas d&apos;usage</TableColumn>
            <TableColumn>Permissions accordées</TableColumn>
            <TableColumn>Statut</TableColumn>
            <TableColumn className="text-right">Actions</TableColumn>
          </TableHeader>
          <TableBody items={filteredApplicants}>
            {(app) => (
              <TableRow id={app.id}>
                {/* Creator Identity */}
                <TableCell>
                  <div className="space-y-0.5">
                    <span className="font-bold text-foreground block">
                      {app.name || 'Créateur Sans Nom'}
                    </span>
                    <span className="text-[11px] text-muted-foreground block font-mono">
                      {app.email}
                    </span>
                  </div>
                </TableCell>

                {/* Subdomain */}
                <TableCell>
                  {app.subdomain ? (
                    <a
                      href={`https://${app.subdomain}.qoe.fi`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-muted-foreground hover:text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {app.subdomain}.qoe.fi
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Aucun</span>
                  )}
                </TableCell>

                {/* Usage Justification */}
                <TableCell className="max-w-sm">
                  {app.apiApplicationReason ? (
                    <div className="space-y-1">
                      <p
                        className={`text-muted-foreground leading-relaxed font-mono text-[11px] ${
                          expandedReasonId === app.id ? '' : 'line-clamp-2'
                        }`}
                      >
                        {app.apiApplicationReason}
                      </p>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          setExpandedReasonId(expandedReasonId === app.id ? null : app.id)
                        }
                        className="h-auto p-0 text-[10px] font-bold text-primary hover:underline hover:bg-transparent"
                      >
                        {expandedReasonId === app.id ? 'Replier' : "Voir tout l'usage"}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">
                      Pas de cas d&apos;usage fourni
                    </span>
                  )}
                </TableCell>

                {/* Granted permissions (modular) */}
                <TableCell>
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
                          <Badge
                            key={g}
                            variant="soft"
                            tone="brand"
                            size="xs"
                            title={moduleLabel(g, modules)}
                          >
                            {meta?.icon ?? <Globe className="w-3 h-3" />}
                            {moduleLabel(g, modules)}
                          </Badge>
                        );
                      })
                    )}
                  </div>
                  {app.apiAccessStatus === 'approved' && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => openPicker(app, 'edit')}
                      className="mt-1 h-auto p-0 text-[10px] text-muted-foreground hover:text-primary hover:bg-transparent"
                    >
                      <Settings2 className="w-3 h-3" />
                      Modifier les permissions
                    </Button>
                  )}
                </TableCell>

                {/* Access Status Badge */}
                <TableCell>
                  {app.apiAccessStatus === 'none' && (
                    <Badge variant="soft" tone="neutral" size="xs">
                      None
                    </Badge>
                  )}
                  {app.apiAccessStatus === 'pending' && (
                    <Badge variant="soft" tone="vivid" dot size="xs">
                      Pending
                    </Badge>
                  )}
                  {app.apiAccessStatus === 'approved' && (
                    <Badge variant="soft" tone="success" dot size="xs">
                      Approved
                    </Badge>
                  )}
                  {app.apiAccessStatus === 'rejected' && (
                    <Badge variant="soft" tone="danger" size="xs">
                      Rejected
                    </Badge>
                  )}
                  {app.apiAccessStatus === 'revoked' && (
                    <Badge variant="soft" tone="danger" size="xs">
                      Revoked
                    </Badge>
                  )}
                </TableCell>

                {/* Interactive Management Buttons */}
                <TableCell className="text-right">
                  {loadingId === app.id ? (
                    <div className="flex justify-end pr-4">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Actions when Pending */}
                      {app.apiAccessStatus === 'pending' && (
                        <>
                          <Button
                            variant="solid"
                            tone="success"
                            size="xs"
                            onClick={() => openPicker(app, 'approved')}
                          >
                            Approuver
                          </Button>
                          <Button
                            variant="soft"
                            tone="danger"
                            size="xs"
                            onClick={() => handleUpdateStatus(app.id, 'rejected')}
                          >
                            Refuser
                          </Button>
                        </>
                      )}

                      {/* Actions when Approved */}
                      {app.apiAccessStatus === 'approved' && (
                        <Button
                          variant="outline"
                          tone="neutral"
                          size="xs"
                          onClick={() => handleUpdateStatus(app.id, 'revoked')}
                          className="hover:text-destructive-text"
                        >
                          Révoquer l&apos;accès
                        </Button>
                      )}

                      {/* Actions when Rejected, Revoked or None */}
                      {(app.apiAccessStatus === 'rejected' ||
                        app.apiAccessStatus === 'revoked' ||
                        app.apiAccessStatus === 'none') && (
                        <Button
                          variant="solid"
                          tone="neutral"
                          size="xs"
                          onClick={() => openPicker(app, 'approved')}
                        >
                          Activer l&apos;accès API
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {/* Permission picker modal */}
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isApproval ? "Accorder l'accès API" : 'Modifier les permissions'}
          </DialogTitle>
          <DialogDescription>
            {isApproval
              ? 'Sélectionnez les permissions à accorder à ce créateur. Vous pourrez les ajuster à tout moment.'
              : "Ajustez les permissions de ce créateur sans changer son statut (l'admin se réserve le droit)."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
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
                      <div
                        key={m.key}
                        onClick={() => toggle(m.key)}
                        className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                          checked
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        <Checkbox
                          isSelected={checked}
                          onChange={() => toggle(m.key)}
                          size="sm"
                          className="mt-0.5 pointer-events-none"
                        />
                        <div className="space-y-0.5">
                          <span className="block text-xs font-bold text-foreground">{m.label}</span>
                          <span className="block text-[11px] text-muted-foreground leading-snug">
                            {m.description}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </DialogBody>

        <DialogFooter className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setGrants(active.map((m) => m.key))}
            className="text-primary hover:underline hover:bg-transparent"
          >
            Tout sélectionner
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button
              variant="solid"
              tone="brand"
              size="sm"
              onClick={() => onConfirm(grants)}
              disabled={grants.length === 0}
            >
              {isApproval ? 'Accorder l’accès' : 'Enregistrer'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
