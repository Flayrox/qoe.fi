'use client';

// =====================================================================
// 🧮 RolesMatrixSimulator — Matrice rôles × capacités & simulateur (C3)
// =====================================================================
// Permet de visualiser les habilitations du système et de simuler
// immédiatement « qui peut exécuter l'action X ? » avec le décompte
// des détenteurs actifs par rôle.
// =====================================================================

import React, { useState, useMemo } from 'react';
import { Check, Users, Shield, ArrowRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { Input } from '@qoe/ui/ui/input';
import { Button } from '@qoe/ui/button';
import { ADMIN_DOMAINS } from '@/lib/admin-console';
import type { AccessRoleRow, AccessCapabilityRow } from '@/lib/admin-access-data';

interface RolesMatrixSimulatorProps {
  roles: AccessRoleRow[];
  capabilities: AccessCapabilityRow[];
}

const DOMAIN_LABELS: Record<string, string> = {
  pilotage: 'Pilotage',
  moderation: 'Modération',
  croissance: 'Croissance',
  produit: 'Produit',
  plateforme: 'Plateforme',
};

export function RolesMatrixSimulator({ roles, capabilities }: RolesMatrixSimulatorProps) {
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [inspectedCapabilityKey, setInspectedCapabilityKey] = useState<string | null>(null);

  const heldMap = useMemo(() => {
    return new Map(roles.map((role) => [role.key, new Set(role.capabilities)]));
  }, [roles]);

  const filteredCapabilities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return capabilities.filter((cap) => {
      const matchesDomain = selectedDomain === 'all' || cap.domain === selectedDomain;
      if (!matchesDomain) return false;
      if (!query) return true;
      return (
        cap.label.toLowerCase().includes(query) ||
        cap.key.toLowerCase().includes(query) ||
        cap.description?.toLowerCase().includes(query)
      );
    });
  }, [capabilities, search, selectedDomain]);

  const inspectedCapability = useMemo(() => {
    if (!inspectedCapabilityKey) return null;
    return capabilities.find((c) => c.key === inspectedCapabilityKey) ?? null;
  }, [capabilities, inspectedCapabilityKey]);

  const authorizedRoles = useMemo(() => {
    if (!inspectedCapability) return [];
    return roles.filter((r) => heldMap.get(r.key)?.has(inspectedCapability.key));
  }, [inspectedCapability, roles, heldMap]);

  return (
    <div className="space-y-4">
      {/* Barre d'action : Recherche + Domaines */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="xs"
            variant={selectedDomain === 'all' ? 'solid' : 'soft'}
            tone="neutral"
            onClick={() => setSelectedDomain('all')}
          >
            Tous les domaines
          </Button>
          {ADMIN_DOMAINS.map((domain) => (
            <Button
              key={domain}
              type="button"
              size="xs"
              variant={selectedDomain === domain ? 'solid' : 'soft'}
              tone="neutral"
              onClick={() => setSelectedDomain(domain)}
            >
              {DOMAIN_LABELS[domain] ?? domain}
            </Button>
          ))}
        </div>

        <div className="w-full md:w-72">
          <Input
            placeholder="Simuler : rechercher une capacité…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-[11px]"
          />
        </div>
      </div>

      {/* Encart Simulateur « Qui peut X ? » */}
      {inspectedCapability && (
        <div className="rounded border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <span className="text-[12px] font-semibold text-foreground">
                Simulateur : « Qui peut {inspectedCapability.label.toLowerCase()} ? »
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                ({inspectedCapability.key})
              </span>
            </div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setInspectedCapabilityKey(null)}
            >
              Fermer la simulation
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
            {authorizedRoles.map((role) => (
              <div
                key={role.key}
                className="flex items-center justify-between rounded border border-success/30 bg-success/10 px-2.5 py-1.5 text-[11px]"
              >
                <div>
                  <span className="font-semibold text-success-text">{role.label}</span>
                  <p className="text-[10px] text-muted-foreground">{role.key}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground font-medium">
                  <Users className="size-3" />
                  {role.holders} actif{role.holders > 1 ? 's' : ''}
                </span>
              </div>
            ))}
            {authorizedRoles.length === 0 && (
              <p className="text-[11px] italic text-muted-foreground">
                Aucun rôle ne détient cette capacité (verrouillée par défaut).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Rôles et décomptes */}
      <div className="flex flex-wrap gap-1.5" data-testid="access-roles-holders">
        {roles.map((role) => (
          <span
            key={role.key}
            className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 text-[11px]"
            title={role.description}
          >
            <span className="font-medium text-foreground">{role.label}</span>
            <span className="inline-flex items-center gap-0.5 tabular-nums text-muted-foreground text-[10px]">
              <Users className="size-3" /> {role.holders}
            </span>
          </span>
        ))}
      </div>

      {/* Grille dense de la matrice */}
      <div className="overflow-x-auto rounded border border-border bg-card">
        <Table aria-label="Matrice des rôles" size="xs" data-testid="access-roles-matrix">
          <TableHeader>
            <TableColumn isRowHeader className="sticky left-0 bg-muted/30 z-10 w-72">
              Capacité & verbe ({filteredCapabilities.length})
            </TableColumn>
            {roles.map((role) => (
              <TableColumn key={role.key} className="text-center whitespace-nowrap min-w-24">
                <span title={role.description}>{role.label}</span>
              </TableColumn>
            ))}
          </TableHeader>
          <TableBody>
            {filteredCapabilities.map((capability) => {
              const isSelected = inspectedCapabilityKey === capability.key;
              return (
                <TableRow
                  key={capability.key}
                  id={capability.key}
                  className={isSelected ? 'bg-primary/5' : undefined}
                >
                  <TableCell className="sticky left-0 bg-background z-10">
                    <div
                      role="button"
                      tabIndex={0}
                      className="text-left w-full cursor-pointer focus:outline-none hover:opacity-80 transition-opacity"
                      onClick={() => setInspectedCapabilityKey(capability.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setInspectedCapabilityKey(capability.key);
                        }
                      }}
                      title="Cliquer pour simuler les accès à cette capacité"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground text-[11px]">
                          {capability.label}
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground/40" />
                      </div>
                      <span className="tabular-nums text-[10px] text-muted-foreground">
                        {capability.key}
                      </span>
                    </div>
                  </TableCell>
                  {roles.map((role) => {
                    const has = heldMap.get(role.key)?.has(capability.key) ?? false;
                    return (
                      <TableCell
                        key={role.key}
                        className="text-center"
                        data-testid={`access-matrix-${role.key}-${capability.key}`}
                      >
                        {has ? (
                          <span
                            className="inline-flex size-4 items-center justify-center rounded-full bg-success/15 text-success-text text-[10px] font-bold"
                            aria-label="détenue"
                          >
                            <Check className="size-2.5" />
                          </span>
                        ) : (
                          <span
                            className="text-muted-foreground/30 text-[10px]"
                            aria-label="absente"
                          >
                            —
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
