'use client';

// =====================================================================
// 🔍 UniversalExportVerifierPanel — Contrôle d'exports signés Ed25519
// =====================================================================
// Vérifie cryptographiquement n'importe quelle pièce signée issue de la
// plateforme (audit, abonnés, consentements). L'API Go vérifie le SHA-256
// du payload, l'empreinte canonique et la signature Ed25519 autonome.
// =====================================================================

import { useState } from 'react';
import { CheckCircle2, FileCheck2, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Textarea } from '@qoe/ui/input';
import {
  verifySignedExportAction,
  type SignedExportVerification,
} from '@/lib/admin-compliance-actions';

export function UniversalExportVerifierPanel() {
  const [jsonText, setJsonText] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<SignedExportVerification | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleVerify = async () => {
    const trimmed = jsonText.trim();
    if (!trimmed) {
      setGlobalError('Veuillez coller le contenu JSON d’un export signé.');
      setResult(null);
      return;
    }

    setIsVerifying(true);
    setGlobalError(null);
    setResult(null);

    try {
      const res = await verifySignedExportAction(trimmed);
      if (!res.success) {
        setGlobalError(res.error);
      } else {
        setResult(res.result);
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Erreur de vérification');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <FileCheck2 className="h-4 w-4" /> Vérificateur d&apos;export signé universel (Ed25519)
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Contrôle cryptographique indépendant d&apos;une pièce scellée (registre d&apos;audit,
            abonnés, consentements). Vérifie l&apos;intégrité de la charge utile, la chaîne
            canonique et la validité de la signature Ed25519 sans secrets partagés.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] text-muted-foreground block">
          Coller le document JSON d&apos;export scellé
        </label>
        <Textarea
          rows={6}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder='{"envelope": {"algorithm": "Ed25519", "keyId": "...", "signature": "..."}, "payload": {...}}'
          className="text-xs font-sans tabular-nums"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleVerify}
          disabled={isVerifying || !jsonText.trim()}
          className="gap-1.5"
        >
          {isVerifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileCheck2 className="h-3.5 w-3.5" />
          )}
          Vérifier l&apos;authenticité de la pièce
        </Button>
      </div>

      {globalError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive-text flex items-center gap-2"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      {result && (
        <div
          role="region"
          className={`rounded-lg border px-4 py-3 text-xs ${
            result.isValid
              ? 'border-success/40 bg-success/10 text-success-text'
              : 'border-destructive/40 bg-destructive/10 text-destructive-text'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {result.isValid ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <span>Document authentique — Signature Ed25519 valide et intègre</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                <span>
                  Document invalide — {result.error || 'La signature ou le contenu a été altéré'}
                </span>
              </>
            )}
          </div>
          {result.isValid && (
            <div className="mt-2 text-[11px] text-muted-foreground space-y-1">
              <div>
                Registre / Périmètre :{' '}
                <span className="font-semibold text-foreground">{result.scope ?? 'Inconnu'}</span>
              </div>
              <div>
                Clé de signature :{' '}
                <span className="tabular-nums font-semibold text-foreground">
                  {result.keyId ?? '—'}
                </span>{' '}
                ({result.algorithm ?? 'Ed25519'})
              </div>
              {result.generatedAt && (
                <div>
                  Date de scellement :{' '}
                  <span className="tabular-nums">
                    {new Date(result.generatedAt).toLocaleString('fr-FR')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
