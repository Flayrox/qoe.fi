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
  onScrollHandler: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  forceExpandTabBar: () => void;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const scrollY = useSharedValue(0);
  const isScrollingDown = useSharedValue(false);
  const lastScrollY = useSharedValue(0);

  const onScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;

      scrollY.value = currentY;

      if (currentY <= 15) {
        isScrollingDown.value = false;
      } else if (diff > 4) {
        isScrollingDown.value = true;
      } else if (diff < -4) {
        isScrollingDown.value = false;
      }

      lastScrollY.value = currentY;
    },
  });

  const forceExpandTabBar = () => {
    'worklet';
    isScrollingDown.value = false;
  };

  return (
    <ScrollContext.Provider
      value={{
        scrollY,
        isScrollingDown,
        onScrollHandler: onScrollHandler as any,
        forceExpandTabBar,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollCoordination() {
  const ctx = useContext(ScrollContext);
  if (!ctx) {
    // Fallback gracieux si utilisé hors provider
    const dummyY = useSharedValue(0);
    const dummyDown = useSharedValue(false);
    return {
      scrollY: dummyY,
      isScrollingDown: dummyDown,
      onScrollHandler: () => {},
      forceExpandTabBar: () => {},
    };
  }
  return ctx;
}
