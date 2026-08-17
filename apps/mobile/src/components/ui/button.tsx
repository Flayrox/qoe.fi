// =====================================================================
// 🔘 Button — Bouton multi-variantes (port de .reference/bluesky/src/components/Button.tsx)
// =====================================================================
// Variantes : solid/outline/ghost, couleurs primary/secondary/negative/
// primary_subtle/negative_subtle, tailles large/medium/small/tiny,
// formes default(pill)/round/square/rectangular. États hovered/pressed/
// disabled exposés aux enfants (render-prop) — parité Bluesky.
// =====================================================================

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type ButtonColor =
  'primary' | 'secondary' | 'negative' | 'primary_subtle' | 'negative_subtle';
export type ButtonVariant = 'solid' | 'outline' | 'ghost';
export type ButtonSize = 'tiny' | 'small' | 'medium' | 'large';
export type ButtonShape = 'round' | 'square' | 'rectangular' | 'default';

export type ButtonState = {
  hovered: boolean;
  focused: boolean;
  pressed: boolean;
  disabled: boolean;
  interacting: boolean;
};

export type ButtonProps = Pick<
  PressableProps,
  'disabled' | 'onPress' | 'testID' | 'onLongPress' | 'hitSlop' | 'onPressIn' | 'onPressOut'
> & {
  label: string;
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  shape?: ButtonShape;
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  children: ReactNode | ((ctx: ButtonState) => ReactNode);
};

const Context = createContext<
  ButtonState & {
    color?: ButtonColor;
    variant?: ButtonVariant;
    size?: ButtonSize;
    shape?: ButtonShape;
  }
>({
  hovered: false,
  focused: false,
  pressed: false,
  disabled: false,
  interacting: false,
});
Context.displayName = 'ButtonContext';

export function useButtonContext() {
  return useContext(Context);
}

export const Button = forwardRef<React.ComponentRef<typeof Pressable>, ButtonProps>(
  (
    {
      children,
      variant = 'solid',
      color = 'primary',
      size = 'medium',
      shape = 'default',
      label,
      disabled: disabledProp = false,
      style,
      hoverStyle,
      onPressIn: onPressInOuter,
      onPressOut: onPressOutOuter,
      ...rest
    },
    ref
  ) => {
    const theme = useTheme();
    const [pressed, setPressed] = useState(false);
    const disabled = disabledProp ?? false;

    const onPressIn = useCallback(
      (e: GestureResponderEvent) => {
        setPressed(true);
        onPressInOuter?.(e);
      },
      [onPressInOuter]
    );
    const onPressOut = useCallback(
      (e: GestureResponderEvent) => {
        setPressed(false);
        onPressOutOuter?.(e);
      },
      [onPressOutOuter]
    );

    const { baseStyles, hoverStyles } = useMemo(() => {
      const base: ViewStyle[] = [];
      const hover: ViewStyle[] = [];
      const fg = theme.primary;
      const bg = theme.backgroundElement;
      const destructive = theme.destructive;

      if (variant === 'solid') {
        if (color === 'primary') {
          base.push({ backgroundColor: disabled ? theme.backgroundSelected : fg });
          if (!disabled) hover.push({ opacity: 0.85 });
        } else if (color === 'secondary') {
          base.push({ backgroundColor: theme.backgroundSelected });
          if (!disabled) hover.push({ backgroundColor: theme.border });
        } else if (color === 'negative') {
          base.push({ backgroundColor: disabled ? theme.backgroundSelected : destructive });
          if (!disabled) hover.push({ opacity: 0.85 });
        } else if (color === 'primary_subtle') {
          base.push({ backgroundColor: disabled ? theme.backgroundSelected : bg });
          if (!disabled) hover.push({ backgroundColor: theme.border });
        } else if (color === 'negative_subtle') {
          base.push({ backgroundColor: disabled ? theme.backgroundSelected : bg });
          if (!disabled) hover.push({ backgroundColor: theme.border });
        }
      } else if (variant === 'outline') {
        base.push({ borderWidth: 1, borderColor: theme.border, backgroundColor: 'transparent' });
        if (!disabled) {
          if (color === 'primary') {
            base.push({ borderColor: fg });
            hover.push({ backgroundColor: bg });
          } else if (color === 'negative') {
            base.push({ borderColor: destructive });
            hover.push({ backgroundColor: bg });
          } else {
            hover.push({ backgroundColor: theme.backgroundSelected });
          }
        }
      } else {
        // ghost
        base.push({ backgroundColor: 'transparent' });
        if (!disabled) hover.push({ backgroundColor: theme.backgroundSelected });
      }

      if (shape === 'default') {
        const pad =
          size === 'large'
            ? { paddingVertical: 12, paddingHorizontal: 24 }
            : size === 'medium'
              ? { paddingVertical: 9, paddingHorizontal: 20 }
              : size === 'small'
                ? { paddingVertical: 8, paddingHorizontal: 14 }
                : { paddingVertical: 5, paddingHorizontal: 10 };
        base.push({ borderRadius: 999, gap: 5, ...pad });
      } else if (shape === 'rectangular') {
        const pad =
          size === 'large'
            ? { paddingVertical: 12, paddingHorizontal: 25, borderRadius: 10 }
            : size === 'medium'
              ? { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 8 }
              : size === 'small'
                ? { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 8 }
                : { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 6 };
        base.push(pad);
      } else if (shape === 'round' || shape === 'square') {
        const box = size === 'large' ? 44 : size === 'tiny' ? 25 : 33;
        base.push({ width: box, height: box });
        if (shape === 'round') base.push({ borderRadius: box / 2 });
        else base.push({ borderRadius: size === 'tiny' ? 6 : 10 });
      }

      return { baseStyles: base, hoverStyles: hover };
    }, [variant, color, size, shape, disabled, theme]);

    const state: ButtonState = {
      hovered: false,
      focused: false,
      pressed,
      disabled,
      interacting: pressed,
    };

    return (
      <Pressable
        ref={ref}
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
          baseStyles,
          style,
          pressed && hoverStyles,
          pressed && hoverStyle,
        ]}
        {...rest}
      >
        <Context.Provider value={{ ...state, color, variant, size, shape }}>
          {typeof children === 'function' ? children(state) : children}
        </Context.Provider>
      </Pressable>
    );
  }
);
Button.displayName = 'Button';

/** Texte stylé selon la couleur/taille du bouton parent. */
export function ButtonText({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  const { color, variant, disabled, size } = useButtonContext();

  const textColor = useMemo(() => {
    if (variant === 'solid' && (color === 'primary' || color === 'negative')) {
      return '#ffffff';
    }
    if (color === 'negative') return theme.destructive;
    if (color === 'primary') return theme.primary;
    return disabled ? theme.textSecondary : theme.text;
  }, [variant, color, disabled, theme]);

  const fontSize = size === 'large' ? 16 : size === 'tiny' ? 12 : 14;

  return (
    <ThemedText
      style={[{ color: textColor, fontSize, fontWeight: '600', textAlign: 'center' }, style]}
    >
      {children}
    </ThemedText>
  );
}

/** Icône stylée selon la couleur du bouton parent (SF Symbols). */
export function ButtonIcon({ name, size = 16 }: { name: SymbolViewProps['name']; size?: number }) {
  const theme = useTheme();
  const { color, variant, disabled } = useButtonContext();
  const tint =
    variant === 'solid' && (color === 'primary' || color === 'negative')
      ? '#ffffff'
      : color === 'negative'
        ? theme.destructive
        : color === 'primary'
          ? theme.primary
          : disabled
            ? theme.textSecondary
            : theme.text;
  return <SymbolView name={name} size={size} tintColor={tint} weight="regular" />;
}

/** Type util pour un enfant élément unique (parité ButtonProps.children). */
export type ButtonChild = ReactElement | ReactNode;
