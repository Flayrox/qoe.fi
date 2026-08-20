import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { getOnboardingData } from '@qoe/db/onboarding';
import { AnalyticsScript } from '@qoe/analytics/client';
import { OnboardingModal } from '@qoe/ui';
import { completeOnboarding } from './onboarding-actions';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  // Résolution polymorphe : la Publication (personnelle OU média) est l'identité tenant
  const publication = await prisma.publication.findFirst({
    where: {
      OR: [{ subdomain: decodedDomain }, { customDomain: decodedDomain }],
    },
    select: {
      id: true,
      subdomain: true,
      customDomain: true,
      umamiWebsiteId: true,
    },
  });

  if (!publication) {
    notFound();
  }

  const umamiWebsiteId = publication.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  // Onboarding en popup : si l'utilisateur est connecté mais n'a pas terminé
  // l'onboarding, on l'affiche sur n'importe quelle page tenant (pas de redirect
  // vers core). Non fermable tant qu'il n'est pas terminé.
  let onboardingProps: Awaited<ReturnType<typeof getOnboardingData>> | null = null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { hasCompletedOnboarding: true },
    });
    if (!dbUser?.hasCompletedOnboarding) {
      onboardingProps = await getOnboardingData();
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
