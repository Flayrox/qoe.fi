import { Drawer, useDrawerProgress } from 'react-native-drawer-layout';
import { useCallback, useMemo, useState, type PropsWithChildren } from 'react';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { Sidebar } from '@/features/sidebar/sidebar';
import { useTheme } from '@/hooks/use-theme';

import { DrawerContext } from './drawer-context';

// Effet « Twitter » : pendant l'ouverture, le contenu (feed) perd en opacité
// et se rétracte légèrement. `progress` est la SharedValue reanimated 0→1
// fournie par react-native-drawer-layout (DrawerProgressContext).
function DrawerContent({ children }: PropsWithChildren) {
  const progress = useDrawerProgress();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.55]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.96]) }],
  }));

  return <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>;
}

export function AppDrawer({ children }: PropsWithChildren) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openDrawer, closeDrawer }), [openDrawer, closeDrawer]);

  return (
    <DrawerContext.Provider value={value}>
      <Drawer
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        drawerType="front"
        drawerPosition="left"
        swipeEdgeWidth={40}
        drawerStyle={{ width: 300, backgroundColor: theme.background }}
        overlayStyle={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        renderDrawerContent={() => <Sidebar />}
      >
        <DrawerContent>{children}</DrawerContent>
      </Drawer>
    </DrawerContext.Provider>
  );
}
