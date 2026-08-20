'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface WidgetErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 🛡️ WidgetErrorBoundary — Isole les erreurs au niveau des micro-composants
 * Empêche qu'un bug dans une section secondaire (sidebar, widget, avatar, badge) ne fasse crasher l'ensemble de la page en 500.
 */
export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    } else {
      console.warn('[WidgetErrorBoundary] Composant isolé suite à une erreur interceptée:', error);
    }
  }

  public override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
