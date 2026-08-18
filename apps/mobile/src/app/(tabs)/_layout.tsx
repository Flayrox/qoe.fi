import AppTabs from '@/components/app-tabs';
import { AppDrawer } from '@/components/drawer/app-drawer';
import { ScrollProvider } from '@/components/scroll/scroll-context';

export default function TabsLayout() {
  return (
    <ScrollProvider>
      <AppDrawer>
        <AppTabs />
      </AppDrawer>
    </ScrollProvider>
  );
}
