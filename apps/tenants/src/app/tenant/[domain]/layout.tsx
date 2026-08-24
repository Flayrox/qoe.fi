import React from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { getCurrentUser } from '@qoe/auth/current-user';
import { AnalyticsScript } from '@qoe/analytics/client';
import { OnboardingModal, type OnboardingCategory, type OnboardingCreator } from '@qoe/ui';
import { completeOnboarding } from './onboarding-actions';
import { fetchTenantPublication } from '@/lib/tenant-data';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  // Go-first : GET /v1/publications/by-domain/{domain} — résolution polymorphe
  // de la Publication (personnelle OU média) comme identité tenant.
  const publication = await fetchTenantPublication(decodedDomain);

  if (!publication) {
    notFound();
  }

  const umamiWebsiteId = publication.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  // Onboarding en popup : si l'utilisateur est connecté mais n'a pas terminé
  // l'onboarding, on l'affiche sur n'importe quelle page tenant (pas de redirect
  // vers core). Non fermable tant qu'il n'est pas terminé.
  let onboardingProps: {
    categories: OnboardingCategory[];
    suggestedCreators: OnboardingCreator[];
  } | null = null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      const dbUser = await getCurrentUser();
      if (dbUser && !dbUser.hasCompletedOnboarding) {
        // Go-first : GET /v1/home/onboarding (catégories + créateurs suggérés).
        const data = await fetch(`${process.env.QOE_API_URL}/v1/home/onboarding`, {
          cache: 'no-store',
        });
        if (data.ok) {
          onboardingProps = (await data.json()) as {
            categories: OnboardingCategory[];
            suggestedCreators: OnboardingCreator[];
          };
        }
      }
    } catch (err) {
      console.error('[tenant layout] onboarding data:', err);
    }
  }

  return (
    <>
      <AnalyticsScript websiteId={umamiWebsiteId} />
      {children}
      {onboardingProps && (
        <OnboardingModal
          open
          dismissible={false}
          categories={onboardingProps.categories}
          suggestedCreators={onboardingProps.suggestedCreators}
          onSubmit={completeOnboarding}
        />
      )}
    </>
  );
}
