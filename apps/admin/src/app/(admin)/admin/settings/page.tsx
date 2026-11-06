import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import {
  SETTINGS_CATALOG,
  SETTINGS_CATEGORIES,
  SETTINGS_CATEGORY_LABELS,
  type SettingsCategory,
} from '@/lib/admin-settings-catalog';

export const dynamic = 'force-dynamic';

// =====================================================================
// 🎛️ /admin/settings — l'index des leviers, pas un formulaire de plus
// =====================================================================
// Chaque ligne dit : le levier, ce qu'il change, sa portée, la capacité qui
// l'ouvre et le niveau de preuve. Une capacité manquante n'efface pas la
// ligne — elle la passe en lecture, pour qu'on sache qu'un levier existe
// même sans le droit de le toucher.
// =====================================================================

export default async function AdminSettingsPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.config.read');

  const held = new Set(identity?.capabilities ?? []);
  const editable = SETTINGS_CATALOG.filter((lever) => held.has(lever.capability)).length;

  return (
    <div className="space-y-4">
      <QueuePageHeader
        icon={<SlidersHorizontal className="size-4" />}
        title="Réglages"
        badge={`${editable}/${SETTINGS_CATALOG.length} modifiables`}
        description="Tous les leviers de la plateforme, avec l’écran qui les porte, la capacité qu’ils exigent et la preuve demandée. Cette page n’écrit rien : elle dit où l’on règle."
      />

      {SETTINGS_CATEGORIES.map((category: SettingsCategory) => {
        const levers = SETTINGS_CATALOG.filter((lever) => lever.category === category);
        if (levers.length === 0) return null;
        return (
          <section key={category} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[13px] font-semibold">{SETTINGS_CATEGORY_LABELS[category]}</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {levers.length} leviers
              </span>
            </div>
            <Table
              aria-label={SETTINGS_CATEGORY_LABELS[category]}
              size="xs"
              className="rounded-md border-border/70"
            >
              <TableHeader>
                <TableColumn id="lever" isRowHeader width={230}>
                  Levier
                </TableColumn>
                <TableColumn id="effect">Effet</TableColumn>
                <TableColumn id="scope" width={90}>
                  Portée
                </TableColumn>
                <TableColumn id="capability" width={210}>
                  Capacité
                </TableColumn>
                <TableColumn id="guard" width={160}>
                  Preuve
                </TableColumn>
                <TableColumn id="open" width={64}>
                  <span className="sr-only">Ouvrir</span>
                </TableColumn>
              </TableHeader>
              <TableBody items={levers} emptyState="Aucun levier dans cette catégorie.">
                {(lever) => {
                  const allowed = held.has(lever.capability);
                  return (
                    <TableRow id={lever.id}>
                      <TableCell className="font-medium text-foreground">{lever.label}</TableCell>
                      <TableCell className="text-muted-foreground">{lever.effect}</TableCell>
                      <TableCell className="text-muted-foreground">{lever.scope}</TableCell>
                      <TableCell
                        className={allowed ? 'text-muted-foreground' : 'text-muted-foreground/50'}
                      >
                        {lever.capability}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lever.guard}</TableCell>
                      <TableCell className="text-right">
                        {allowed ? (
                          <Link
                            href={lever.href}
                            className="text-[11px] font-medium text-[#EE4B2B] hover:underline"
                          >
                            Ouvrir
                          </Link>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/50">lecture</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </section>
        );
      })}

      <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
        Un levier sans écran n’est pas un levier : voir la couverture sur{' '}
        <Link href="/admin/system" className="font-medium text-[#EE4B2B] hover:underline">
          Système
        </Link>
        .
      </p>
    </div>
  );
}
