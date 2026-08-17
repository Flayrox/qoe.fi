import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export interface DrawerContextValue {
  openDrawer: () => void;
  closeDrawer: () => void;
  progress?: SharedValue<number>;
}

export const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useDrawer(): DrawerContextValue {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within an AppDrawer');
  }
  return context;
}
