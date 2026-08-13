import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { AnalyticsScript } from '@qoe/analytics/client';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  const creator = await prisma.user.findFirst({
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

  if (!creator) {
    notFound();
  }

  // Derive creator-specific Umami tracking websiteId (or fallback to root)
  const umamiWebsiteId = creator.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  return (
    <>
      <AnalyticsScript websiteId={umamiWebsiteId} />
      {children}
    </>
  );
}
