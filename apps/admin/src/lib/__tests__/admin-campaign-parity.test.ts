// =====================================================================
// 🧪 admin-campaign-parity — parité Go ↔ TS du vocabulaire des campagnes (C7)
// =====================================================================
// Les types et audiences de campagne sont verrouillés par contrainte CHECK
// en base et par constantes dans apps/api/internal/modules/admin/staff_campaigns.go.
// Ce test lit le fichier Go sur le disque pour garantir que TypeScript
// ne diverge jamais des constantes du serveur.
// =====================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { CAMPAIGN_TYPES, CAMPAIGN_AUDIENCES } from '../admin-campaign-types';

const GO_FILE = fileURLToPath(
  new URL('../../../../../apps/api/internal/modules/admin/staff_campaigns.go', import.meta.url)
);

function readStaffCampaignsGo(): string {
  return readFileSync(GO_FILE, 'utf8');
}

describe('parité Go ↔ TS des campagnes staff (C7)', () => {
  const source = readStaffCampaignsGo();

  it('les types de campagne correspondent exactement aux constantes Go', () => {
    const tsValues = CAMPAIGN_TYPES.map((t) => t.value);

    // Extraction des constantes CampaignXxx = "..."
    const matches = [
      ...source.matchAll(
        /Campaign(LegalNotice|StaffDirect|ProductNews|FeatureLaunch)\s*=\s*"([^"]+)"/g
      ),
    ];
    const goValues = matches.map((m) => m[2]);

    expect(goValues.length).toBe(4);
    expect(tsValues).toEqual(goValues);
    expect(tsValues).toContain('legal.version_notice');
    expect(tsValues).not.toContain('LEGAL_NOTICE');
  });

  it('les sélecteurs d’audience correspondent exactement aux constantes Go', () => {
    const tsValues = CAMPAIGN_AUDIENCES.map((a) => a.value);

    const matches = [
      ...source.matchAll(/CampaignAudience(AllUsers|Subscribers|Interested)\s*=\s*"([^"]+)"/g),
    ];
    const goValues = matches.map((m) => m[2]);

    expect(goValues.length).toBe(3);
    expect(tsValues).toEqual(goValues);
    expect(tsValues).toContain('all_active_users');
    expect(tsValues).toContain('publication_subscribers');
    expect(tsValues).toContain('feature_interested');
  });
});
