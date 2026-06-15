import { notFound } from "next/navigation";
import { prisma } from "@qoe/db/client";
import Link from "next/link";
import { Metadata } from "next";
import { SocialIcon, TenantHeader, SubscribeForm } from "@qoe/ui";
import { Lock } from "lucide-react";
import { PaywallCut } from "./PaywallCut";
import { createClient } from "@qoe/supabase/server";
import { headers } from "next/headers";
import { ReaderActions } from "./ReaderActions";
import { TextHighlighter } from "./TextHighlighter";

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedSlug = decodeURIComponent(slug);

  const creator = await prisma.user.findFirst({
    where: {
      OR: [
        { subdomain: decodedDomain },
        { customDomain: decodedDomain },
      ],
    },
    include: {
      articles: {
        where: { slug: decodedSlug, published: true },
      },
    },
  });

  if (!creator || creator.articles.length === 0) return {};

  const article = creator.articles[0];

  return {
    title: article.seoTitle || `${article.title} | ${creator.name}`,
    description: article.seoDescription || article.content.replace(/<[^>]*>?/gm, '').substring(0, 160),
    robots: {
      index: creator.allowIndexing,
      follow: creator.allowIndexing,
    },
    openGraph: {
      title: article.seoTitle || article.title,
      description: article.seoDescription || article.content.replace(/<[^>]*>?/gm, '').substring(0, 160),
      type: 'article',
      publishedTime: article.createdAt.toISOString(),
      authors: [creator.name || ''],
    }
  };
}

export default async function TenantArticlePage({ params }: PageProps) {
  const { domain, slug } = await params;

  const decodedDomain = decodeURIComponent(domain);
  const decodedSlug = decodeURIComponent(slug);

  const creator = await prisma.user.findFirst({
    where: {
      OR: [
        { subdomain: decodedDomain },
        { customDomain: decodedDomain },
      ],
    },
    include: {
      navigation: {
        orderBy: { order: "asc" }
      },
      socialLinks: {
        orderBy: { order: "asc" }
      },
      articles: {
        where: { 
          slug: decodedSlug,
          published: true 
        },
        include: {
          category: true
        }
      },
    },
  });

  if (!creator || creator.articles.length === 0) {
    return notFound();
  }

  const article = creator.articles[0];
  const { 
    name, accentColor, fontFamily, logoUrl, layoutStyle, themeMode, 
    navigation, socialLinks, stripeAccountId, supportUrl 
  } = creator;

  const supportLink = stripeAccountId ? `/support` : supportUrl || null;

  const customStyle = {
    "--tenant-accent": accentColor || "hsl(var(--primary))",
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : "inherit",
    ...(themeMode === 'dark' && { colorScheme: 'dark' }),
  } as React.CSSProperties;

  const isBrutalist = layoutStyle === 'brutalist';

  // Get active user session server-side
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // DB queries for reader relationships
  const follow = user ? await prisma.follows.findUnique({
    where: {
      readerId_creatorId: {
        readerId: user.id,
        creatorId: creator.id
      }
    }
  }) : null;
  const hasFollowed = !!follow;

  const bookmark = user ? await prisma.bookmark.findUnique({
    where: {
      readerId_articleId: {
        readerId: user.id,
        articleId: article.id
      }
    }
  }) : null;
  const hasBookmarked = !!bookmark;

  const userHighlights = user ? await prisma.highlight.findMany({
    where: {
      readerId: user.id,
      articleId: article.id
    },
    select: {
      id: true,
      text: true,
      note: true
    }
  }) : [];

  // Subscription checking logic
  const subscription = user ? await prisma.subscriber.findUnique({
    where: {
      email_creatorId: {
        email: user.email || "",
        creatorId: creator.id
      }
    }
  }) : null;
  const isSubscribed = !!(subscription?.isActive && subscription?.isPremium);

  // Author and admin bypass
  const isAuthor = user?.id === creator.id;
  const isSuperAdmin = user ? (await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } }))?.role === 'superadmin' : false;

  const showPaywall = article.isPremium && !isSubscribed && !isAuthor && !isSuperAdmin;

  // Resolve main app URL
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const mainAppUrl = host.includes("localhost") ? "http://localhost:3000" : "https://qoe.fi";

  return (
    <div 
      className={`min-h-screen ${themeMode === 'dark' ? 'dark bg-zinc-950 text-zinc-50' : 'bg-background text-foreground'} selection:bg-[var(--tenant-accent)] selection:text-white transition-colors duration-300`}
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
        isArticlePage={true}
      />

      <main className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
        <article className={`relative prose prose-lg md:prose-xl ${themeMode === 'dark' ? 'prose-invert' : 'prose-zinc'} prose-headings:font-bold prose-a:text-[var(--tenant-accent)] hover:prose-a:text-[var(--tenant-accent)]/80 prose-img:rounded-2xl prose-img:shadow-lg max-w-none`}>
          <header className="mb-16 text-center not-prose">
            <div className="flex justify-center items-center gap-4 mb-6">
              <time dateTime={article.createdAt.toISOString()} className={`text-sm md:text-base font-semibold uppercase tracking-widest text-[var(--tenant-accent)] ${isBrutalist ? 'border-2 border-[var(--tenant-accent)] inline-block px-3 py-1' : ''}`}>
                {new Date(article.createdAt).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </time>
              {article.category && (
                <Link href={`/category/${article.category.slug}`} className={`text-sm md:text-base font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors ${isBrutalist ? 'border-2 border-foreground inline-block px-3 py-1' : ''}`}>
                  {article.category.name}
                </Link>
              )}
               {article.isPremium && (
                <span className={`flex items-center gap-1 text-sm md:text-base font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 ${isBrutalist ? 'border-2 border-amber-600 inline-block px-3 py-1' : ''}`}>
                  <Lock className="w-4 h-4" /> Premium
                </span>
              )}
            </div>
            <h1 className={`text-4xl md:text-6xl tracking-tight mb-8 leading-[1.1] ${isBrutalist ? 'font-black uppercase' : 'font-extrabold'}`}>
              {article.title}
            </h1>
            <div className="flex items-center justify-center gap-4 text-muted-foreground font-medium">
              {logoUrl && (
                <img src={logoUrl} alt={`${name}`} className="w-10 h-10 rounded-full object-cover shadow-sm" />
              )}
              <span className="text-lg">By <span className="text-foreground">{name}</span></span>
            </div>
          </header>

          <div id="article-content" className={`mt-12 leading-relaxed ${isBrutalist ? 'font-mono text-lg' : ''}`}>
            <PaywallCut 
              contentHtml={article.content} 
              isPremium={showPaywall} 
              name={name} 
              isBrutalist={isBrutalist} 
              accentColor={accentColor} 
              mainAppUrl={mainAppUrl}
              creatorId={creator.id}
            />
          </div>
        </article>
      </main>

      {/* Reader Actions dock */}
      <ReaderActions
        articleId={article.id}
        creatorId={creator.id}
        creatorName={name || creator.subdomain || ""}
        isAuthenticated={!!user}
        initialBookmarked={hasBookmarked}
        initialFollowed={hasFollowed}
        mainAppUrl={mainAppUrl}
      />

      {/* Client-side Text selection Highlighter tool */}
      <TextHighlighter
        articleId={article.id}
        isAuthenticated={!!user}
        initialHighlights={userHighlights}
        mainAppUrl={mainAppUrl}
      />

      <footer id="subscribe" className={`mt-32 py-24 text-center ${isBrutalist ? 'border-t-4 border-foreground' : 'border-t bg-zinc-50 dark:bg-zinc-900/50'}`}>
        <div className="container max-w-2xl mx-auto px-4">
          <h3 className={`text-3xl mb-6 ${isBrutalist ? 'font-black uppercase' : 'font-bold'}`}>Support our independent journalism</h3>
          <p className="text-lg text-muted-foreground mb-10">
            If you enjoyed this article, consider subscribing or supporting {name}.
          </p>
          <SubscribeForm creatorId={creator.id} isBrutalist={isBrutalist} />
          
           {supportLink && (
               <div className="mt-8">
                 <Link 
                  href={supportLink} 
                  target={supportUrl && !stripeAccountId ? "_blank" : "_self"}
                  className={`inline-block px-8 py-3 font-semibold transition-all ${isBrutalist ? 'border-2 border-foreground bg-background text-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:translate-y-px hover:shadow-none' : 'rounded-full border border-input bg-background hover:bg-muted text-foreground'}`}
                >
                  Support Us Directly
                </Link>
               </div>
            )}
            
            {socialLinks.length > 0 && (
               <div className="flex justify-center gap-6 mt-16 text-muted-foreground">
                  {socialLinks.map((social) => (
                    <Link 
                      key={social.id} 
                      href={social.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-[var(--tenant-accent)] transition-colors"
                    >
                       <SocialIcon platform={social.platform} className="w-6 h-6" />
                    </Link>
                  ))}
               </div>
            )}
        </div>
      </footer>
    </div>
  );
}
