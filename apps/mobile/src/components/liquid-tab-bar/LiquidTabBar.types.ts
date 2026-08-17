import { Ionicons } from '@expo/vector-icons';
import { StyleProp, ViewStyle } from 'react-native';
import type { LiquidGlassViewProps, GlassVariant } from 'react-native-liquid-glassmorphism';

export type { LiquidGlassViewProps, GlassVariant };

export type IconName = keyof typeof Ionicons.glyphMap;

export interface TabIconConfig {
  active: IconName;
  inactive: IconName;
  customRender?: (props: { isFocused: boolean; color: string; size: number }) => React.ReactNode;
}

export interface NavigationRoute {
  key: string;
  name: string;
  params?: object;
}

export interface NavigationState {
  index: number;
  routes: NavigationRoute[];
}

export interface NavigationHelpers {
  navigate: (name: string, params?: object) => void;
  goBack?: () => void;
  emit?: (options: any) => any;
}

export type TabBarColorScheme = 'auto' | 'light' | 'dark';

export interface LiquidTabBarProps {
  state: NavigationState;
  navigation: NavigationHelpers;
  descriptors?: Record<string, any>;
  insets?: { top: number; right: number; bottom: number; left: number };
  colorScheme?: TabBarColorScheme;
  variant?: GlassVariant;
  iconsMap?: Record<string, TabIconConfig>;
  glassProps?: Partial<LiquidGlassViewProps>;
  activeTintColor?: string;
  inactiveTintColor?: string;
  glassTintColor?: string;
  bottomOffset?: number;
  maxWidth?: number;
  containerStyle?: StyleProp<ViewStyle>;
  onProfilePress?: () => void;
}
