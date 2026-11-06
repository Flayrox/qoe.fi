import { Badge } from '@qoe/ui/badge';
import type { DeveloperAccessStatus } from '../types';

const STATUS_META: Record<
  DeveloperAccessStatus,
  { label: string; tone: 'neutral' | 'vivid' | 'success' | 'danger' }
> = {
  none: { label: 'Non demandé', tone: 'neutral' },
  pending: { label: 'En attente', tone: 'vivid' },
  approved: { label: 'Accès actif', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' },
  revoked: { label: 'Révoqué', tone: 'danger' },
};

export function DeveloperStatusBadge({ status }: { status: DeveloperAccessStatus }) {
  const meta = STATUS_META[status];

  return (
    <Badge variant="soft" tone={meta.tone} shape="pill" size="sm">
      {meta.label}
    </Badge>
  );
}
