'use client';

// =====================================================================
// 🏖️ SandboxConsole — Console Bac à sable & Impersonation (Lot D6)
// =====================================================================
// Fournit l'environnement d'essai isolé :
//   - Déclenchement de scénarios de seed prédéfinis
//   - Prise d'identité contrôlée (impersonation) avec motif obligatoire
//   - Traçabilité et audit inconditionnel
// =====================================================================

import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Layers,
  Loader2,
  Play,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { attemptWithStepUp, readMessage } from '@/lib/authz-feedback';
import {
  executeSeedScenarioAction,
  impersonateUserAction,
  type ImpersonateResult,
  type SandboxScenarioInfo,
} from '@/lib/admin-sandbox-actions';

interface SandboxConsoleProps {
  scenarios: SandboxScenarioInfo[];
}

export function SandboxConsole({ scenarios }: SandboxConsoleProps) {
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  // Impersonation state
  const [impersonateEmail, setImpersonateEmail] = useState('');
  const [impersonateReason, setImpersonateReason] = useState('');
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonateResult, setImpersonateResult] = useState<ImpersonateResult | null>(null);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  const handleRunScenario = async (scenarioId: string) => {
    setRunningScenarioId(scenarioId);
    setSeedStatus(null);

    try {
      const res = await attemptWithStepUp(
        () => executeSeedScenarioAction(scenarioId, 1),
        { reason: 'L’exécution d’un scénario de données d’essai exige une preuve forte récente.' }
      );

      if (!res.success) {
        setSeedStatus(readMessage(res) ?? res.error ?? 'Erreur d’exécution');
      } else {
        setSeedStatus(
          `Audité · ${res.result.message} à ${new Date().toLocaleTimeString('fr-FR')}`
        );
      }
    } catch (err) {
      setSeedStatus(err instanceof Error ? err.message : 'Erreur d’exécution');
    } finally {
      setRunningScenarioId(null);
    }
  };

  const handleImpersonate = async () => {
    if (!impersonateEmail.trim() || !impersonateReason.trim()) {
      setImpersonateError('Email et motif obligatoires.');
      return;
    }

    setIsImpersonating(true);
    setImpersonateError(null);
    setImpersonateResult(null);

    try {
      const res = await attemptWithStepUp(
        () => impersonateUserAction(impersonateEmail, impersonateReason),
        { reason: 'La prise d’identité d’un utilisateur exige une preuve forte récente.' }
      );

      if (!res.success) {
        setImpersonateError(readMessage(res) ?? res.error ?? 'Prise d’identité refusée');
      } else {
        setImpersonateResult(res.result);
      }
    } catch (err) {
      setImpersonateError(err instanceof Error ? err.message : 'Erreur lors de la prise d’identité');
    } finally {
      setIsImpersonating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Bannière d'avertissement Bac à sable ── */}
      <div
        role="region"
        aria-label="Avertissement environnement"
        className="rounded-lg border border-highlight/40 bg-highlight/10 p-4 text-xs text-foreground flex items-start gap-3"
      >
        <FlaskConical className="h-4 w-4 text-highlight shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold">Environnement de test &amp; simulation contrôlée</div>
          <p className="text-muted-foreground leading-relaxed">
            Les scénarios génèrent des jeux de données d&apos;essai isolés pour valider les comportements
            opérationnels sans polluer les comptes réels. Toute prise d&apos;identité et toute génération est
            tracée de manière inaltérable dans le registre d&apos;audit superadmin.
          </p>
        </div>
      </div>

      {/* ── Section A : Scénarios de Seed ── */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-primary" /> Scénarios de données d&apos;essai (Seeds)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Déclenchez des cas d&apos;usage prédéfinis pour alimenter les files de modération, d&apos;outbox et de conformité.
          </p>
        </div>

        {seedStatus && (
          <div
            role="status"
            className="rounded-lg border border-border bg-card px-4 py-2.5 text-xs text-foreground flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <span>{seedStatus}</span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((sc) => {
            const isRunning = runningScenarioId === sc.id;
            return (
              <div
                key={sc.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between space-y-4 shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-semibold text-foreground">{sc.title}</h3>
                    <Badge variant="soft" tone="neutral" size="xs">
                      {sc.targetFile}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {sc.description}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {sc.entities.map((e) => (
                      <span
                        key={e}
                        className="rounded-full border border-border px-2 py-0.5 text-[9px] tabular-nums text-muted-foreground"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRunScenario(sc.id)}
                  disabled={isRunning}
                  className="w-full gap-1.5"
                >
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Générer le scénario
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section B : Impersonation contrôlée ── */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <UserCheck className="h-4 w-4 text-primary" /> Prise d&apos;identité contrôlée (Impersonation)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Endossez l&apos;identité d&apos;un compte lecteur ou média pour diagnostiquer son affichage et ses accès réels.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] text-muted-foreground space-y-1 block">
            Email ou identifiant du compte
            <Input
              size="sm"
              value={impersonateEmail}
              onChange={(e) => setImpersonateEmail(e.target.value)}
              placeholder="ex: lecteur@qoe.test"
            />
          </label>
          <label className="text-[11px] text-muted-foreground space-y-1 block">
            Motif obligatoire (audit, support ticket #…)
            <Input
              size="sm"
              value={impersonateReason}
              onChange={(e) => setImpersonateReason(e.target.value)}
              placeholder="Motif consigné au journal d’audit"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-muted-foreground">
            Chaque session d&apos;impersonation est horodatée avec le compte opérateur responsable.
          </div>
          <Button
            type="button"
            variant="solid"
            tone="brand"
            size="sm"
            onClick={handleImpersonate}
            disabled={isImpersonating || !impersonateEmail.trim() || !impersonateReason.trim()}
            className="gap-1.5"
          >
            {isImpersonating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            Endosser l&apos;identité
          </Button>
        </div>

        {impersonateError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive-text flex items-center gap-2"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{impersonateError}</span>
          </div>
        )}

        {impersonateResult && (
          <div
            role="region"
            aria-label="Résultat impersonation"
            className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-xs text-foreground space-y-2"
          >
            <div className="flex items-center gap-2 font-medium text-success-text">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span>{impersonateResult.message}</span>
            </div>
            <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-4">
              <span>Rôle : <strong className="text-foreground">{impersonateResult.role}</strong></span>
              <span>Identifiant : <span className="tabular-nums font-semibold text-foreground">{impersonateResult.userId}</span></span>
            </div>
            <div className="pt-2">
              <a
                href={impersonateResult.readerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <span>Ouvrir l&apos;espace lecteur en tant que cet utilisateur</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
