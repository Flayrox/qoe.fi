// =====================================================================
// 🍞 Toast — Système de toasts (port de .reference/bluesky/src/components/Toast)
// =====================================================================
// API impérative globale : `Toast.show('message')` / `Toast.show(el)` /
// `Toast.dismiss()`. Rendus en bas d'écran avec fond contrasté et fondu.
// Gère `{type:'success'|'error'|'info'|'warning'}`.
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  id: number;
  content: string | ReactElement;
  kind: ToastKind;
}

interface ToastApi {
  show: (content: string | ReactElement, kind?: ToastKind) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {}, dismiss: () => {} });
ToastContext.displayName = 'ToastContext';

let nextId = 0;
let globalShow: ToastApi['show'] = () => {};
let globalDismiss: ToastApi['dismiss'] = () => {};

/** API impérative globale (hors React). */
export const Toast = {
  show(content: string | ReactElement, kind: ToastKind = 'info') {
    globalShow(content, kind);
  },
  dismiss() {
    globalDismiss();
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() =>
      setToast(null)
    );
  }, [opacity]);

  const show = useCallback(
    (content: string | ReactElement, kind: ToastKind = 'info') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ id: nextId++, content, kind });
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(dismiss, 4000);
    },
    [opacity, dismiss]
  );

  globalShow = show;
  globalDismiss = dismiss;

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const tint = useMemo(() => {
    switch (toast?.kind) {
      case 'success':
        return theme.success;
      case 'error':
        return theme.destructive;
      case 'warning':
        return '#f59e0b';
      default:
        return theme.text;
    }
  }, [toast?.kind, theme]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity }]}>
          <View style={[styles.toast, { backgroundColor: theme.text, borderLeftColor: tint }]}>
            {typeof toast.content === 'string' ? (
              <ThemedText style={[styles.text, { color: theme.background }]} numberOfLines={3}>
                {toast.content}
              </ThemedText>
            ) : (
              toast.content
            )}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    maxWidth: 480,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
