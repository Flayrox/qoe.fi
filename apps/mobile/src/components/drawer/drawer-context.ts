import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export interface DrawerContextValue {
  openDrawer: () => void;
  closeDrawer: () => void;
  progress?: SharedValue<number>;
}

export const drawerController: {
  openDrawer: () => void;
  closeDrawer: () => void;
} = {
  openDrawer: () => {},
  closeDrawer: () => {},
};

export const openGlobalDrawer = () => {
  drawerController.openDrawer();
};

export const closeGlobalDrawer = () => {
  drawerController.closeDrawer();
};

export const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useDrawer(): DrawerContextValue {
  const context = useContext(DrawerContext);
  if (!context) {
    return {
      openDrawer: openGlobalDrawer,
      closeDrawer: closeGlobalDrawer,
    };
  }
  return context;
}
