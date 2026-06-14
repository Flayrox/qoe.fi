// =====================================================================
// 🏠 Tenant Homepage — apps/web/src/app/tenant/[domain]/page.tsx
// =====================================================================
// 📖 Page publique d'un créateur, servie sur :
//    - creator.qoe.fi (subdomain)
//    - qoe.fi/tenant/creator (path, en dev)
//    - customdomain.com (CNAME)
//
// 🎯 Cette page charge le créateur par subdomain ou customDomain,
//    affiche sa bio, ses articles, et un formulaire d'abonnement.
//
// 📖 Migré depuis src/app/tenant/[domain]/page.tsx en Phase 2.
// =====================================================================

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { findByDomain } from "@qoe/db/repositories/users";
import { findPublishedByAuthor } from "@qoe/db/repositories/articles";

// Ré-export des composants UI (seront migrés physiquement en Phase 8)
import { SocialIcon } from "../../../../../../src/components/ui/SocialIcon";
import { TenantHeader } from "../../../../../../src/components/ui/TenantHeader";
import { SubscribeForm } from "../../../../../../src/components/ui/SubscribeForm";

interface PageProps {
  params: Promise<{ domain: string }>;
}

/**
 * 📋 Génère les metadata SEO dynamiquement.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  const creator = await findByDomain(decodedDomain);
  if (!creator) return {};

  return {
    title: creator.seoTitle || `${creator.name} | ${decodedDomain}`,
    description:
      creator.seoDescription ||
      creator.heroText ||
      `Explore the thoughts and articles of ${creator.name}.`,
    robots: {
      index: creator.allowIndexing,
      follow: creator.allowIndexing,
    },
    icons: creator.logoUrl ? { icon: creator.logoUrl } : undefined,
    openGraph: {
      title: creator.seoTitle || creator.name || decodedDomain,
      description: creator.seoDescription || creator.heroText || "",
      images: creator.headerImageUrl ? [{ url: creator.headerImageUrl }] : [],
    },
  };
}

/**
 * 🏠 Page d'accueil d'un tenant.
 */
export default async function TenantHomepage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  const creator = await findByDomain(decodedDomain);
  if (!creator) {
    return notFound();
  }

  // Charge les articles publiés du créateur
  const articles = await findPublishedByAuthor(creator.id, { take: 30 });

  const {
    name,
    heroText,
    accentColor,
    fontFamily,
    logoUrl,
    headerImageUrl,
    footerText,
    layoutStyle,
    themeMode,
    navigation,
    socialLinks,
    stripeAccountId,
    supportUrl,
  } = creator;

  const customStyle: React.CSSProperties = {
    ["--tenant-accent" as string]: accentColor || "hsl(var(--primary))",
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : "inherit",
    ...(themeMode === "dark" && { colorScheme: "dark" }),
  };

  const isMagazine = layoutStyle === "magazine";
  const isBrutalist = layoutStyle === "brutalist";

  return (
    <div
      className={`min-h-screen ${themeMode === "dark" ? "dark bg-zinc-950 text-zinc-50" : "bg-background text-foreground"} selection:bg-[var(--tenant-accent)] selection:text-white transition-colors duration-300`}
      style={customStyle}
    >
      <TenantHeader
        name={name}
        domain={decodedDomain}
        logoUrl={logoUrl}
        layoutStyle={layoutStyle}
        stripeAccountId={stripeAccountId}
        supportUrl={supportUrl}
        navigation={navigation}
        socialLinks={socialLinks}
      />

      <section className="relative w-full">
        {headerImageUrl && (
          <div className="absolute inset-0 w-full h-[60vh] md:h-[70vh] -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background z-10 mix-blend-multiply" />
            <img
              src={headerImageUrl}
              alt="Header Cover"
              className="w-full h-full object-cover object-center"
            />
          </div>
        )}

        <div
          className={`container mx-auto px-4 lg:px-8 ${headerImageUrl ? "pt-32 pb-24 md:pt-48 text-white" : "py-20 md:py-32"} flex flex-col items-center text-center max-w-4xl`}
        >
          <h2
            className={`text-5xl md:text-7xl tracking-tighter mb-8 leading-[1.1] ${isBrutalist ? "font-black uppercase" : "font-bold"}`}
          >
            {heroText || `Welcome to ${name}'s digital space`}
          </h2>
          <p
            className={`text-xl md:text-2xl max-w-2xl mx-auto leading-relaxed mb-10 ${headerImageUrl ? "text-zinc-200" : "text-muted-foreground"}`}
          >
            A premium sanctuary for profound insights, carefully curated stories, and independent thought.
          </p>

          {socialLinks.length > 0 && (
            <div className={`flex gap-6 ${headerImageUrl ? "text-white" : "text-muted-foreground"}`}>
              {socialLinks.map((social) => (
                <Link
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--tenant-accent)] hover:scale-110 transition-all duration-300"
                  aria-label={`Follow us on ${social.platform}`}
                >
                  <SocialIcon platform={social.platform} className="w-7 h-7" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <main id="articles" className="container mx-auto px-4 lg:px-8 py-16 md:py-24 max-w-6xl">
        <div className="flex items-center justify-between mb-12 border-b pb-4">
          <h3 className={`text-3xl ${isBrutalist ? "font-black uppercase" : "font-semibold tracking-tight"}`}>
            Latest Publications
          </h3>
          <span className="text-sm text-muted-foreground">{articles.length} articles</span>
        </div>

        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed rounded-3xl">
            <p className="text-xl text-muted-foreground font-medium">No articles published yet.</p>
            <p className="text-sm text-muted-foreground mt-2">Check back later for new content.</p>
          </div>
        ) : (
          <div
            className={`grid gap-8 md:gap-12 ${isMagazine ? "grid-cols-1 md:grid-cols-12" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}
          >
            {articles.map((article, i) => (
              <Link
                key={article.id}
                href={`/article/${article.slug}`}
                className={`group flex flex-col items-start transition-all duration-300 hover:-translate-y-1
                  ${isMagazine && i === 0 ? "md:col-span-12 md:flex-row md:items-center md:gap-12 border-b pb-12 mb-4" : ""}
                  ${isMagazine && i > 0 && i < 3 ? "md:col-span-6" : ""}
                  ${isMagazine && i >= 3 ? "md:col-span-4" : ""}
                  ${isBrutalist ? "border-4 border-foreground p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] bg-card" : ""}
                `}
              >
                <div className={`w-full ${isMagazine && i === 0 ? "md:w-1/2" : ""}`}>
                  <div className="flex items-center gap-x-4 text-sm mb-4">
                    <time
                      dateTime={article.createdAt.toISOString()}
                      className="text-[var(--tenant-accent)] font-medium uppercase tracking-wider text-xs"
                    >
                      {new Date(article.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                    {article.category && (
                      <span
                        className={`px-2 py-1 text-xs font-semibold ${isBrutalist ? "border border-foreground uppercase" : "bg-muted rounded-md"} text-muted-foreground`}
                      >
                        {article.category.name}
                      </span>
                    )}
                  </div>
                  <h3
                    className={`text-2xl leading-tight group-hover:text-[var(--tenant-accent)] transition-colors ${isMagazine && i === 0 ? "md:text-5xl font-extrabold mb-6" : "font-bold mb-3"} ${isBrutalist ? "uppercase font-black" : ""}`}
                  >
                    {article.title}
                  </h3>
                  <p
                    className={`line-clamp-3 text-muted-foreground leading-relaxed ${isMagazine && i === 0 ? "text-lg md:text-xl md:line-clamp-4" : "text-base"}`}
                  >
                    {article.content.replace(/<[^>]*>?/gm, "").substring(0, 250)}...
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer
        className={`mt-24 py-20 px-4 text-center ${isBrutalist ? "border-t-4 border-foreground" : "border-t bg-zinc-50 dark:bg-zinc-900/50"}`}
      >
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="inline-block p-4 rounded-full bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)] mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className={`text-3xl md:text-4xl ${isBrutalist ? "font-black uppercase" : "font-bold"}`}>
            Join the inner circle
          </h3>
          <p className="text-lg text-muted-foreground">
            {footerText ||
              `Subscribe to receive the latest stories and insights from ${name} directly in your inbox.`}
          </p>
          <SubscribeForm creatorId={creator.id} isBrutalist={isBrutalist} />

          <div className="pt-16 flex flex-col items-center gap-6">
            {socialLinks.length > 0 && (
              <div className="flex gap-6 text-muted-foreground">
                {socialLinks.map((social) => (
                  <Link
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--tenant-accent)] transition-colors"
                  >
                    <SocialIcon platform={social.platform} className="w-5 h-5" />
                  </Link>
                ))}
              </div>
            )}
            <div className="text-sm font-medium text-muted-foreground">
              &copy; {new Date().getFullYear()} {name}. Powered by{" "}
              <Link
                href="https://qoe.fi"
                className="underline hover:text-[var(--tenant-accent)] transition-colors"
              >
                qoe.fi
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
