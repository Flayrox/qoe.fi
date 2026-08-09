import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@qoe/db';
import { subscriptionsRepository } from '@qoe/db/repositories/subscriptions';
import { truncateArticleContentForPaywall } from '@qoe/billing';
import { PaywallCut } from '@/components/paywall/PaywallCut';

interface TenantArticlePageProps {
  params: Promise<{
    domain: string;
    slug: string;
  }>;
}

export default async function TenantArticlePage({ params }: TenantArticlePageProps) {
  const { domain, slug } = await params;

  // 1. Resolve tenant creator by domain or subdomain
  const creator = await prisma.user.findFirst({
    where: {
      OR: [
        { subdomain: domain },
        { customDomain: domain },
      ],
    },
    select: {
      id: true,
      name: true,
      username: true,
      subdomain: true,
      customDomain: true,
      logoUrl: true,
    },
  });

  if (!creator) {
    notFound();
  }

  // 2. Fetch article
  const article = await prisma.article.findFirst({
    where: {
      authorId: creator.id,
      slug,
      published: true,
    },
    include: {
      category: true,
    },
  });

  if (!article) {
    notFound();
  }

  // 3. Resolve reader entitlement (guest by default)
  const entitlement = await subscriptionsRepository.getReaderEntitlement(creator.id, null, null);

  // 4. Server-Side AST Paywall Truncation (0 bytes leak for non-subscribers)
  const paywallResult = truncateArticleContentForPaywall(article.content, {
    isPremium: article.isPremium,
    isSubscriber: entitlement.isPaidSubscriber,
  });

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 font-sans text-zinc-900">
      {/* Article Header */}
      <header className="mb-10 space-y-4">
        {article.category && (
          <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
            {article.category.name}
          </span>
        )}
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 leading-tight md:text-5xl">
          {article.title}
        </h1>
        <div className="flex items-center gap-3 pt-2 text-sm text-zinc-500">
          <span className="font-medium text-zinc-900">{creator.name || creator.username}</span>
          <span>•</span>
          <time dateTime={article.createdAt.toISOString()}>
            {new Date(article.createdAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
        </div>
      </header>

      {/* Rendered HTML Content (Truncated if non-subscriber) */}
      <div
        className="prose prose-zinc max-w-none text-base leading-relaxed"
        dangerouslySetInnerHTML={{ __html: paywallResult.content }}
      />

      {/* Paywall Cut CTA Card (if content was truncated) */}
      {paywallResult.isTruncated && (
        <PaywallCut
          creatorId={creator.id}
          creatorName={creator.name || creator.username || 'Ce créateur'}
          articleTitle={article.title}
        />
      )}
    </article>
  );
}
