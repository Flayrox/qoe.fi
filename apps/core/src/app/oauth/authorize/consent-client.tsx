'use client';

import React, { useState } from 'react';
import { Check, X, Shield, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import {
  decideOAuthAuthorizationAction,
  type OAuthAuthorizeInfo,
  type OAuthAuthorizeParams,
} from './actions';

interface ConsentError {
  code: string;
  description: string;
}

export function OAuthConsentClient({
  info,
  params,
  error,
}: {
  info: OAuthAuthorizeInfo | null;
  params: OAuthAuthorizeParams;
  error: ConsentError | null;
}) {
  const [remember, setRemember] = useState(false);
  const [deciding, setDeciding] = useState<'approve' | 'deny' | null>(null);

  const decide = async (decision: 'approve' | 'deny') => {
    setDeciding(decision);
    try {
      const res = await decideOAuthAuthorizationAction(params, decision, remember);
      if (res.redirect) {
        window.location.assign(res.redirect);
        return;
      }
      toast.error(res.errorDescription || 'Impossible de finaliser la demande.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setDeciding(null);
    }
  };

  // ── Écran d'erreur (requête invalide, client inconnu, etc.) ──
  if (error || !info) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12 text-foreground">
        <div className="w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-2xl space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">Demande d&apos;autorisation invalide</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {error?.description ?? 'Cette demande de connexion ne peut pas être traitée.'}
          </p>
          {error?.code && (
            <code className="block bg-muted/50 border border-border rounded-xl p-3 font-mono text-xs text-muted-foreground">
              {error.code}
            </code>
          )}
        </div>
      </main>
    );
  }

  const { client, scopes } = info;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl overflow-hidden">
        {/* En-tête qoe.fi */}
        <div className="px-8 py-6 border-b border-border/80 flex items-center gap-3 bg-muted/20">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold">qoe.fi</p>
            <p className="text-xs text-muted-foreground">Connexion sécurisée · OpenID Connect</p>
          </div>
        </div>

        <div className="px-8 py-7 space-y-6">
          {/* Application tierce */}
          <div className="flex items-start gap-4">
            {client.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.logoUrl}
                alt={client.name}
                className="w-12 h-12 rounded-xl object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
                <ExternalLink className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">{client.name}</h1>
              {client.homepageUrl && (
                <a
                  href={client.homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline break-all"
                >
                  {client.homepageUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
              {client.description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {client.description}
                </p>
              )}
            </div>
          </div>

          {/* Autorisation demandée */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              souhaite accéder à votre compte :
            </p>
            <div className="border border-border/80 rounded-xl divide-y divide-border/60 overflow-hidden">
              {scopes.map((scope) => (
                <div key={scope.name} className="flex items-start gap-3 px-4 py-3">
                  <div className="pt-0.5">
                    {scope.required ? (
                      <Check className="w-4 h-4 text-primary" />
                    ) : (
                      <span className="block w-4 h-4 rounded-full border border-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold flex items-center gap-2">
                      <code className="text-primary">{scope.name}</code>
                      {scope.required && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          requis
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {scope.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remember */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              Ne plus me redemander pour cette application (les autorisations restent révocables à
              tout moment).
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="px-8 py-5 border-t border-border/80 bg-muted/10 flex items-center justify-end gap-2.5">
          <button
            onClick={() => decide('deny')}
            disabled={deciding !== null}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
          >
            {deciding === 'deny' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            Refuser
          </button>
          <button
            onClick={() => decide('approve')}
            disabled={deciding !== null}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5 shadow-xs"
          >
            {deciding === 'approve' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Autoriser
          </button>
        </div>
      </div>
    </main>
  );
}
