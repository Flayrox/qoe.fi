import { Tabs } from 'expo-router';
import { getMobileSurfaces, requireRouteName } from '@qoe/config';
import { LiquidTabBar } from '@/components/liquid-tab-bar';
import { useDrawer } from '@/components/drawer/drawer-context';

// 📱 Les onglets viennent du manifeste partagé : aucun `Tabs.Screen` ni libellé
// n'est recopié ici. `showOnNative` décide de la présence d'un onglet.
export default function AppTabs() {
  const { openDrawer } = useDrawer();
  const tabs = getMobileSurfaces('native');
  const feed = tabs.find((surface) => surface.id === 'mobile.feed');
  if (!feed) throw new Error('Onglet mobile.feed absent du manifeste de surfaces');
  const initialRouteName = requireRouteName(feed);

  return (
    <Tabs
      initialRouteName={initialRouteName}
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
      {tabs.map((surface) => (
        <Tabs.Screen
          key={surface.id}
          name={requireRouteName(surface)}
          options={{ title: surface.defaultLabel }}
          listeners={
            surface.id === 'mobile.profile'
              ? {
                  tabPress: (event) => {
                    event.preventDefault();
                    openDrawer();
                  },
                }
              : undefined
          }
        />
      ))}
    </Tabs>
  );
}
