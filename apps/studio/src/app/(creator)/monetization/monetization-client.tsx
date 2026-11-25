'use client';

// =====================================================================
// 💳 MonetizationClient — catalogue de formules + portail abonné
// =====================================================================
// Aucun calcul de prix ici : on saisit un montant en euros, la conversion
// en centimes est la seule arithmétique, et le backend valide le reste.
// =====================================================================

import { useState, useTransition } from 'react';
import { createCreatorTierAction, openBillingPortalAction, type BillingTier } from '@qoe/sdk';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';

interface MonetizationClientProps {
  publisherId: string;
  initialTiers: BillingTier[];
  initialError?: string | null;
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function MonetizationClient({
  publisherId,
  initialTiers,
  initialError = null,
}: MonetizationClientProps) {
  const [tiers, setTiers] = useState<BillingTier[]>(initialTiers);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [priceEuro, setPriceEuro] = useState('5');
  const [description, setDescription] = useState('');
  const [stripePriceId, setStripePriceId] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const cents = Math.round(Number.parseFloat(priceEuro.replace(',', '.')) * 100);
    if (!name.trim() || !Number.isFinite(cents) || cents <= 0) {
      setError(t`Un nom et un prix mensuel positif sont requis.`);
      return;
    }

    startTransition(async () => {
      const res = await createCreatorTierAction({
        publisherId,
        name: name.trim(),
        description: description.trim(),
        monthlyPriceCents: cents,
        stripePriceIdMonthly: stripePriceId.trim(),
      });
      if (!res.ok) {
        setError(res.ok ? null : (res.error?.message ?? t`Création impossible.`));
        return;
      }
      setTiers((current) => [...current, res.data]);
      setName('');
      setDescription('');
      setStripePriceId('');
      setNotice(t`Formule créée.`);
    });
  };

  const openPortal = () => {
    setError(null);
    startTransition(async () => {
      const res = await openBillingPortalAction();
      if (!res.ok) {
        const code = res.error?.code;
        setError(
          code === 'NO_CUSTOMER'
            ? t`Aucun abonnement Stripe sur ce compte pour l’instant.`
            : t`Portail indisponible pour le moment.`
        );
        return;
      }
      window.location.href = res.data.url;
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t`Formules`}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t`Ces formules apparaissent sur le paywall de votre publication. Chaque formule doit être reliée à un tarif Stripe pour être payable ; ce tarif est vérifié et doit débiter exactement le montant affiché, en euros, chaque mois.`}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={openPortal}
            disabled={isPending}
            className="rounded-xl px-3 py-2 text-xs! font-semibold! text-foreground hover:bg-muted leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block "
          >
            {t`Portail de facturation`}
          </Button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-text"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-xl border border-success/20 bg-success/10 p-3 text-xs text-success-text">
            {notice}
          </p>
        )}

        <ul className="mt-5 divide-y divide-border/50">
          {tiers.length === 0 && (
            <li className="py-4 text-xs text-muted-foreground">
              {t`Aucune formule pour l’instant.`}
            </li>
          )}
          {tiers.map((tier) => (
            <li key={tier.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{tier.name}</p>
                {tier.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{tier.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {formatEuro(tier.monthlyPriceCents)}
                  <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                    {t`/mois`}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    tier.stripePriceIdMonthly
                      ? 'bg-success/10 text-success-text'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {tier.stripePriceIdMonthly ? t`Payable` : t`Tarif Stripe manquant`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t`Nouvelle formule`}</h2>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-foreground">
            {t`Nom`}
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t`Membre Premium`}
              className="mt-1 w-full! rounded-xl border border-border bg-background px-3 py-2 text-sm! leading-[20px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            />
          </label>

          <label className="text-xs font-medium text-foreground">
            {t`Prix mensuel (€)`}
            <Input
              value={priceEuro}
              onChange={(event) => setPriceEuro(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full! rounded-xl border border-border bg-background px-3 py-2 text-sm! leading-[20px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            />
          </label>

          <label className="text-xs font-medium text-foreground sm:col-span-2">
            {t`Description (optionnel)`}
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t`Accès aux archives et aux articles réservés.`}
              className="mt-1 w-full! rounded-xl border border-border bg-background px-3 py-2 text-sm! leading-[20px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            />
          </label>

          <label className="text-xs font-medium text-foreground sm:col-span-2">
            {t`Tarif Stripe mensuel (price_…)`}
            <Input
              value={stripePriceId}
              onChange={(event) => setStripePriceId(event.target.value)}
              placeholder="price_1P…"
              className="mt-1 w-full! rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm! leading-[20px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            />
            <span className="mt-1 block font-normal text-muted-foreground">
              {t`Créez le prix dans Stripe, puis collez son identifiant : sans lui, la formule reste affichée mais non payable.`}
            </span>
          </label>

          <div className="sm:col-span-2">
            <Button
              type="submit"
              variant="solid"
              loading={isPending}
              className="rounded-xl bg-foreground px-4 py-2 text-xs! font-bold! text-background leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block "
            >
              {isPending ? t`Création…` : t`Créer la formule`}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
