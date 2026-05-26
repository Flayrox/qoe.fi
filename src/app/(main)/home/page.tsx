import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { Sparkles, Activity, BookMarked, Highlighter, Wallet, Users, Compass, ExternalLink } from "lucide-react"

export default async function ReaderHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Fetch dbUser details
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true, walletBalanceCents: true, onboardingText: true }
  })

  const following = await prisma.follows.findMany({
    where: { readerId: user.id },
    select: { creatorId: true }
  })
  
  const creatorIds = following.map(f => f.creatorId)

  // Fetch followed articles
  const articles = await prisma.article.findMany({
    where: { 
      authorId: { in: creatorIds },
      published: true 
    },
    include: {
      author: { select: { name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true } },
      category: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  // Fetch statistics
  const followsCount = await prisma.follows.count({ where: { readerId: user.id } })
  const bookmarksCount = await prisma.bookmark.count({ where: { readerId: user.id } })
  const highlightsCount = await prisma.highlight.count({ where: { readerId: user.id } })

  // Suggested creators to discover
  const suggestedCreators = await prisma.user.findMany({
    where: {
      role: 'creator',
      isCertified: true,
      id: { notIn: creatorIds }
    },
    select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true },
    take: 3
  })

  return (
    <div className="min-h-screen bg-neutral-50/50 dark:bg-zinc-950/80 text-foreground transition-colors duration-300">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          
          {/* LEFT: Timeline Feed (3 cols) */}
          <div className="lg:col-span-3 space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-200/60 dark:border-zinc-800/60 pb-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#EE4B2B]/10 rounded-xl flex items-center justify-center text-[#EE4B2B]">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Votre Timeline</h1>
                  <p className="text-muted-foreground text-xs">Lectures chronologiques de vos créateurs suivis.</p>
                </div>
              </div>
              
              <span className="text-[10px] font-mono uppercase tracking-wider bg-neutral-100 dark:bg-zinc-900 border px-2.5 py-1 rounded-md text-muted-foreground">
                Zéro Biais Algorithmique
              </span>
            </div>

            {articles.length === 0 ? (
              <div className="text-center py-24 border-2 border-dashed border-neutral-200 dark:border-zinc-800 rounded-[2rem] bg-card/60 p-8">
                <Sparkles className="w-12 h-12 text-[#F97316] mx-auto mb-4 opacity-70 animate-pulse" />
                <h3 className="text-xl font-bold mb-2">Votre timeline est vierge</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-8 text-sm">
                  Pour commencer à lire sans bruit ni distraction, suivez des médias indépendants certifiés dans la colonne de droite.
                </p>
                <Link href="/" className="bg-[#EE4B2B] text-white px-6 py-2.5 rounded-full text-xs font-semibold hover:bg-[#d63d20] transition-colors inline-flex items-center gap-1.5 shadow-lg shadow-[#EE4B2B]/20">
                  Découvrir qoe.fi <Compass className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {articles.map(article => {
                  const host = article.author.customDomain || `${article.author.subdomain}.localhost:3000`
                  const url = `http://${host}/article/${article.slug}`

                  return (
                    <article key={article.id} className="bg-card hover:bg-neutral-50/10 dark:hover:bg-zinc-900/10 border border-neutral-200/50 dark:border-zinc-900/50 rounded-3xl p-6 md:p-8 hover:shadow-xl hover:border-neutral-200 dark:hover:border-zinc-800 transition-all duration-300 group relative">
                      <div className="flex items-center gap-3 mb-5">
                        {article.author.logoUrl ? (
                          <img src={article.author.logoUrl} className="w-8 h-8 rounded-lg object-cover border border-neutral-100 dark:border-zinc-800" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[#EE4B2B]/10 flex items-center justify-center text-[#EE4B2B] font-bold text-xs uppercase">
                            {article.author.name?.substring(0,2) || 'NA'}
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-sm block leading-none">{article.author.name}</span>
                          <span className="text-[10px] text-muted-foreground mt-1 block">@{article.author.subdomain}</span>
                        </div>
                        <span className="text-muted-foreground text-xs ml-auto">
                          {new Date(article.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      
                      <Link href={url} target="_blank" className="block group">
                        <h2 className="text-xl font-bold mb-3 leading-snug group-hover:text-[#EE4B2B] transition-colors">
                          {article.title}
                        </h2>
                        <p className="text-muted-foreground line-clamp-3 mb-6 text-sm leading-relaxed">
                          {article.content.replace(/<[^>]*>?/gm, '').substring(0, 180)}...
                        </p>
                      </Link>
                      
                      <div className="flex items-center justify-between pt-5 border-t border-neutral-100 dark:border-zinc-900">
                         {article.category ? (
                            <span className="text-[10px] font-semibold px-2.5 py-1 bg-neutral-100 dark:bg-zinc-900 rounded-md text-muted-foreground border">
                              {article.category.name}
                            </span>
                         ) : <div />}
                         <a 
                          href={url} 
                          target="_blank" 
                          className="text-xs font-semibold text-[#EE4B2B] flex items-center gap-1 hover:underline"
                         >
                            Lire l'article <ExternalLink className="w-3.5 h-3.5" />
                         </a>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Bento Column Widget Dashboard (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Bento Widget 1: Profile & Wallet */}
            <div className="bg-card border border-neutral-200/60 dark:border-zinc-900/60 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-neutral-200 dark:bg-zinc-800 rounded-2xl flex items-center justify-center font-bold text-[#EE4B2B] text-lg">
                  {dbUser?.name?.substring(0, 2).toUpperCase() || "L"}
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">{dbUser?.name || "Lecteur"}</h3>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">{dbUser?.email}</p>
                </div>
              </div>

              {/* Solde Bento Box */}
              <div className="bg-neutral-100/50 dark:bg-zinc-900/50 border rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Portefeuille</span>
                    <span className="text-xl font-bold font-mono">
                      {((dbUser?.walletBalanceCents || 0) / 100).toFixed(2)} €
                    </span>
                  </div>
                </div>
                <Link href="/billing" className="bg-foreground text-background px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition-opacity">
                  Recharger
                </Link>
              </div>
            </div>

            {/* Bento Widget 2: DNA Lecteur (AI Vector Paragraph) */}
            <div className="bg-card border border-neutral-200/60 dark:border-zinc-900/60 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-[#F97316]" />
                  <h4 className="font-bold text-xs uppercase tracking-wider">Votre ADN Lecteur</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed italic mb-4">
                  "{dbUser?.onboardingText || "Aucun paragraphe rédigé. Pour calibrer votre IA, mettez à jour votre profil lecteur."}"
                </p>
              </div>
              <div className="pt-3 border-t border-neutral-100 dark:border-zinc-900 flex justify-between items-center text-[10px] text-muted-foreground">
                <span className="font-mono uppercase">Vecteur 1536D actif</span>
                <Link href="/onboarding" className="text-[#EE4B2B] hover:underline font-semibold">
                  Recalibrer
                </Link>
              </div>
            </div>

            {/* Bento Widget 3: Sanctuary Stats Dashboard */}
            <div className="grid grid-cols-3 gap-3">
              <Link href="/home" className="bg-card hover:bg-neutral-100/30 dark:hover:bg-zinc-900/30 border rounded-2xl p-4 text-center transition-all group">
                <span className="text-2xl font-black font-mono block text-[#EE4B2B]">{followsCount}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-0.5 mt-1">
                  <Users className="w-2.5 h-2.5" /> Suivis
                </span>
              </Link>
              <Link href="/library" className="bg-card hover:bg-neutral-100/30 dark:hover:bg-zinc-900/30 border rounded-2xl p-4 text-center transition-all group">
                <span className="text-2xl font-black font-mono block text-[#EE4B2B]">{bookmarksCount}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-0.5 mt-1">
                  <BookMarked className="w-2.5 h-2.5" /> Signets
                </span>
              </Link>
              <Link href="/highlights" className="bg-card hover:bg-neutral-100/30 dark:hover:bg-zinc-900/30 border rounded-2xl p-4 text-center transition-all group">
                <span className="text-2xl font-black font-mono block text-[#EE4B2B]">{highlightsCount}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-0.5 mt-1">
                  <Highlighter className="w-2.5 h-2.5" /> Notes
                </span>
              </Link>
            </div>

            {/* Discover creators (Anti filter-bubble suggestion) */}
            {suggestedCreators.length > 0 && (
              <div className="bg-card border border-neutral-200/60 dark:border-zinc-900/60 rounded-3xl p-6 shadow-sm">
                <h4 className="font-bold text-xs uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#EE4B2B]" /> Créateurs à Découvrir
                </h4>
                <div className="space-y-4">
                  {suggestedCreators.map(creator => {
                    const creatorHost = creator.customDomain || `${creator.subdomain}.localhost:3000`
                    return (
                      <div key={creator.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {creator.logoUrl ? (
                            <img src={creator.logoUrl} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs shrink-0">
                              {creator.name?.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-semibold block leading-none truncate">{creator.name}</span>
                            <span className="text-[10px] text-muted-foreground truncate block mt-0.5">@{creator.subdomain}</span>
                          </div>
                        </div>
                        <a 
                          href={`http://${creatorHost}`} 
                          target="_blank"
                          className="bg-neutral-100 dark:bg-zinc-900 hover:bg-[#EE4B2B] hover:text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all border shrink-0"
                        >
                          Visiter
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  )
}
