import React, { createContext, useContext, useRef } from 'react';
import {
  useSharedValue,
  type SharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

interface ScrollContextType {
  scrollY: SharedValue<number>;
  isScrollingDown: SharedValue<boolean>;
  isDragging: SharedValue<boolean>;
  hasTriggeredCompact: SharedValue<boolean>;
  onScrollHandler: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  forceExpandTabBar: () => void;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const scrollY = useSharedValue(0);
  const isScrollingDown = useSharedValue(false);
  const isDragging = useSharedValue(false);
  const hasTriggeredCompact = useSharedValue(false);
  const lastScrollY = useSharedValue(0);

  const onScrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      'worklet';
      isDragging.value = true;
    },
    onScroll: (event) => {
      'worklet';
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;

      scrollY.value = currentY;

      if (currentY <= 15) {
        isScrollingDown.value = false;
        hasTriggeredCompact.value = false;
      } else if (diff > 3) {
        isScrollingDown.value = true;
        hasTriggeredCompact.value = true;
      } else if (diff < -8) {
        isScrollingDown.value = false;
        hasTriggeredCompact.value = false;
      }

      lastScrollY.value = currentY;
    },
    onEndDrag: () => {
      'worklet';
      isDragging.value = false;
    },
    onMomentumEnd: () => {
      'worklet';
      isDragging.value = false;
      if (scrollY.value <= 15) {
        isScrollingDown.value = false;
        hasTriggeredCompact.value = false;
      }
    },
  });

  const forceExpandTabBar = () => {
    'worklet';
    isScrollingDown.value = false;
    hasTriggeredCompact.value = false;
    isDragging.value = false;
  };

  return (
    <ScrollContext.Provider
      value={{
        scrollY,
        isScrollingDown,
        isDragging,
        hasTriggeredCompact,
        onScrollHandler: onScrollHandler as any,
        forceExpandTabBar,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollCoordination() {
  // ⚠️ Rules of Hooks : tous les hooks DOIVENT être appelés avant tout
  // retour conditionnel (l'ordre d'appel doit être identique à chaque
  // rendu). Les shared values de secours sont donc créées inconditionnel-
  // lement, et le fallback ne fait que les renvoyer.
  const ctx = useContext(ScrollContext);
  const dummyY = useSharedValue(0);
  const dummyDown = useSharedValue(false);
  const dummyDrag = useSharedValue(false);
  const dummyCompact = useSharedValue(false);
  if (!ctx) {
    // Fallback gracieux si utilisé hors provider.
    return {
      scrollY: dummyY,
      isScrollingDown: dummyDown,
      isDragging: dummyDrag,
      hasTriggeredCompact: dummyCompact,
      onScrollHandler: () => {},
      forceExpandTabBar: () => {},
    };
  }
  return ctx;
}
