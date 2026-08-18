import { Tabs } from 'expo-router';
import { LiquidTabBar } from '@/components/liquid-tab-bar';
import { useDrawer } from '@/components/drawer/drawer-context';

export default function AppTabs() {
  const { openDrawer } = useDrawer();

  return (
    <Tabs
      tabBar={(props) => <LiquidTabBar {...props} onProfilePress={openDrawer} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openDrawer();
          },
        }}
      />
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explorer' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Activité' }} />
      <Tabs.Screen
        name="messages"
        options={{
          href: null, // Masque la route d'onglet autonome (fusionné dans notifications/activité)
        }}
      />
    </Tabs>
  );
}
