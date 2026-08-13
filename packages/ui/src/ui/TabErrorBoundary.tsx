'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface Props {
  children: ReactNode;
  tabId: string;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught tab error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <TabErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
          onClose={this.props.onClose}
        />
      );
    }

    return this.props.children;
  }
}

function TabErrorFallback({
  error,
  onReset,
  onClose,
}: {
  error: Error | null;
  onReset: () => void;
  onClose?: () => void;
}) {
  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl p-8 shadow-xs flex flex-col items-center justify-center text-center gap-4 py-16 animate-fadeIn">
      <div className="p-3 bg-destructive/10 text-destructive rounded-full border border-destructive/20">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h4 className="font-bold text-xs text-foreground leading-none">
          Oups, cet onglet a rencontré un problème
        </h4>
        <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
          Une erreur imprévue s'est produite lors du rendu de ce composant. Détails :{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono text-[10px] block mt-1">
            {error?.message || 'Erreur interne'}
          </code>
        </p>
      </div>

      <div className="flex gap-2 items-center mt-2">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Réessayer
        </button>
        {onClose && (
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Fermer
          </button>
        )}
      </div>
    </div>
  );
}
