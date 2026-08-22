'use client';

import React from 'react';
import { Globe, LayoutGrid, UserCircle, Compass } from 'lucide-react';
import type { ProvenanceBreakdown } from '../actions';

interface ProvenanceBlockProps {
  provenance: ProvenanceBreakdown;
}

const SOURCE_LABELS: Record<string, string> = {
  feed: 'Feed qoe.fi',
  subdomain: 'Tenants (sous-domaines)',
  public_profile: 'Profils publics',
  direct: 'Accès direct / externe',
};

function Bar({
  label,
  count,
  total,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  icon: React.ReactNode;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-xs font-medium truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 w-32">
        <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold tabular-nums">{count}</span>
        <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
      </div>
    </div>
  );
}

export function ProvenanceBlock({ provenance }: ProvenanceBlockProps) {
  const { bySource, byHostname, byReferrer } = provenance;

  const totalSource = bySource.reduce((s, b) => s + b.count, 0);
  const totalHostname = byHostname.reduce((s, b) => s + b.count, 0);
  const totalReferrer = byReferrer.reduce((s, b) => s + b.count, 0);

  if (totalSource === 0 && totalHostname === 0 && totalReferrer === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary stroke-[1.5]" />
          <h3 className="text-[17px] font-semibold tracking-tight">Provenance des vues</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          7 derniers jours — attribution par lecture réelle
        </span>
      </div>

      {totalSource > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
            Par canal
          </span>
          {bySource
            .sort((a, b) => b.count - a.count)
            .map((b) => (
              <Bar
                key={b.key}
                label={SOURCE_LABELS[b.key] || b.key}
                count={b.count}
                total={totalSource}
                icon={
                  b.key === 'subdomain' ? (
                    <Globe className="w-3.5 h-3.5" />
                  ) : b.key === 'feed' ? (
                    <LayoutGrid className="w-3.5 h-3.5" />
                  ) : b.key === 'public_profile' ? (
                    <UserCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Compass className="w-3.5 h-3.5" />
                  )
                }
              />
            ))}
        </div>
      )}

      {byHostname.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
            Depuis quel tenant
          </span>
          {byHostname
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
            .map((b) => (
              <Bar
                key={b.key}
                label={b.key}
                count={b.count}
                total={totalHostname}
                icon={<Globe className="w-3.5 h-3.5" />}
              />
            ))}
        </div>
      )}

      {byReferrer.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
            Depuis quel profil
          </span>
          {byReferrer
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
            .map((b) => (
              <Bar
                key={b.key}
                label={b.key}
                count={b.count}
                total={totalReferrer}
                icon={<UserCircle className="w-3.5 h-3.5" />}
              />
            ))}
        </div>
      )}
    </div>
  );
}
