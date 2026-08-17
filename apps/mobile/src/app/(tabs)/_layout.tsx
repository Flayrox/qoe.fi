import AppTabs from '@/components/app-tabs';
import { AppDrawer } from '@/components/drawer/app-drawer';

// ─────────────────────────────────────────────────────────────────────
// Layout du groupe (tabs) : le drawer deck (façon X) enveloppe les onglets.
// La sidebar vit en arrière-plan et le feed se décale/rétrécit pour la
// révéler (cf. components/drawer/app-drawer.tsx).
// ─────────────────────────────────────────────────────────────────────
export default function TabsLayout() {
  return (
    <AppDrawer>
      <AppTabs />
    </AppDrawer>
  );
}
