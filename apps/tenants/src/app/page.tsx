// =====================================================================
// 📍 Placeholder home — apps/tenants
// =====================================================================
// Sera remplacé en Phase 2 par la vraie landing `/start` (Hero, etc.)
// Pour l'instant : placeholder qui confirme que l'app boot.
// =====================================================================

import { t } from '@lingui/core/macro';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-4xl font-bold">🌐 apps/tenants</h1>
        <p className="text-lg text-muted-foreground">
          Public web app — landing marketing & tenant pages.
        </p>
        <p className="text-sm text-muted-foreground">{t`Sera implémentée en Phase 2.`}</p>
      </div>
    </main>
  );
}
