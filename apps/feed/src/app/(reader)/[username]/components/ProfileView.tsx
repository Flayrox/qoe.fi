"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, Calendar, Link as LinkIcon, ArrowLeft, Edit3, Repeat, MessageSquare, FileText, Image as ImageIcon } from "lucide-react"
import { AuthorAvatar } from "@/components/ui/AuthorAvatar"
import { ThoughtCard } from "@/components/social/ThoughtCard"
import { ArticleCard } from "@/app/(reader)/home/components/ArticleCard"
import { EditProfileModal } from "@/components/profile/EditProfileModal"
import { toggleFollowCreator } from "@/app/(reader)/home/actions"
import { routes } from "@qoe/config/routes"
import { toast } from "sonner"
import { cn } from "@qoe/utils"
import { ReaderPageLayout } from "@/components/layout/ReaderPageLayout"

interface ProfileViewProps {
  profileUser: any
  currentUserId: string | null
  isOwnProfile: boolean
  initialIsFollowing: boolean
  initialTab?: string
}

type ProfileTab = "thoughts" | "with_replies" | "articles" | "reposts" | "media"

export function ProfileView({
  profileUser: initialProfileUser,
  currentUserId,
  isOwnProfile,
  initialIsFollowing,
  initialTab = "thoughts"
}: ProfileViewProps) {
  const [user, setUser] = useState(initialProfileUser)
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [followersCount, setFollowersCount] = useState(user._count?.followers || 0)
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    ["thoughts", "with_replies", "articles", "reposts", "media"].includes(initialTab) 
      ? (initialTab as ProfileTab) 
      : "thoughts"
  )
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab)
    const username = user.username || user.subdomain || "user"
    const newUrl = routes.feed.profile(username, tab)
    window.history.pushState({ tab }, "", newUrl)
  }

  React.useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname
      const parts = pathname.split("/").filter(Boolean)
      const lastPart = parts[parts.length - 1]
      if (["with_replies", "articles", "reposts", "media"].includes(lastPart)) {
        setActiveTab(lastPart as ProfileTab)
      } else {
        setActiveTab("thoughts")
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const handleFollowToggle = async () => {
    if (!currentUserId) {
      toast.error("Veuillez vous connecter pour suivre cet auteur.")
      return
    }

    const nextState = !isFollowing
    setIsFollowing(nextState)
    setFollowersCount((prev: number) => nextState ? prev + 1 : prev - 1)

    const res = await toggleFollowCreator(user.id)
    if (!res.ok) {
      setIsFollowing(!nextState)
      setFollowersCount((prev: number) => !nextState ? prev + 1 : prev - 1)
      toast.error("Erreur lors de la modification du suivi.")
    } else {
      toast.success(nextState ? `Vous suivez maintenant ${user.name}` : `Abonnement retiré.`)
    }
  }

  // Filter content for tabs
  const rootThoughts = user.posts?.filter((p: any) => !p.parentId) || []
  const replyThoughts = user.posts?.filter((p: any) => !!p.parentId) || []
  const articlesList = user.articles || []
  const repostsList = user.posts?.filter((p: any) => !!p.repostId && !!p.repost) || []
  const mediaThoughts = user.posts?.filter((p: any) => !!p.imageUrl) || []

  const formattedJoinedDate = new Date(user.createdAt).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  })

  return (
    <ReaderPageLayout hideHeader>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 font-sans space-y-6">
        {/* Back navigation */}
        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back()
            } else {
              window.location.href = routes.feed.home()
            }
          }}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour</span>
        </button>

        {/* Profile Card Header */}
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden shadow-xs relative">
          {/* Banner */}
          <div className="h-32 sm:h-44 w-full bg-gradient-to-r from-brand/20 via-muted to-brand/10 relative overflow-hidden">
            {user.headerImageUrl && (
              <img src={user.headerImageUrl} alt="" className="w-full h-full object-cover" />
            )}
          </div>

          {/* Profile Header Info */}
          <div className="px-5 sm:px-6 pb-6 relative">
            {/* Avatar & Action Button Row */}
            <div className="flex items-end justify-between -mt-12 sm:-mt-16 mb-4">
              <div className="ring-4 ring-card rounded-2xl overflow-hidden bg-card">
                <AuthorAvatar user={user} size="2xl" showBadge={false} />
              </div>

              {isOwnProfile ? (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="px-4 py-2 border border-border/60 hover:bg-muted text-foreground text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Éditer le profil</span>
                </button>
              ) : (
                <button
                  onClick={handleFollowToggle}
                  className={cn(
                    "px-5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-xs",
                    isFollowing 
                      ? "border border-border/60 bg-card hover:bg-destructive/10 hover:text-destructive text-foreground" 
                      : "bg-foreground text-background hover:opacity-90"
                  )}
                >
                  {isFollowing ? "Abonné" : "Suivre"}
                </button>
              )}
            </div>

            {/* User Identity */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-none">{user.name}</h1>
                {user.isCertified && <span className="text-brand text-sm font-black" title="Auteur certifié">✓</span>}
              </div>
              <p className="text-xs text-muted-foreground font-medium">@{user.username || user.subdomain}</p>
            </div>

            {/* Bio */}
            {user.heroText && (
              <p className="text-sm text-foreground/90 leading-relaxed pt-3 max-w-2xl font-sans">
                {user.heroText}
              </p>
            )}

            {/* Meta Row: Location, Joined, Website */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-3 font-medium">
              {user.onboardingText && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span>{user.onboardingText}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>A rejoint en {formattedJoinedDate}</span>
              </div>
              {(user.customDomain || user.subdomain) && (
                <a
                  href={`https://${user.customDomain || `${user.subdomain}.qoe.fi`}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-brand hover:underline cursor-pointer"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>{user.customDomain || `${user.subdomain}.qoe.fi`}</span>
                </a>
              )}
            </div>

            {/* Follow Stats */}
            <div className="flex items-center gap-6 pt-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-foreground">{user._count?.following || user._count?.follows || 0}</span>
                <span className="text-muted-foreground font-medium">abonnements</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-foreground">{followersCount}</span>
                <span className="text-muted-foreground font-medium">abonnés</span>
              </div>
            </div>
          </div>

          {/* Profile Tabs Navigation */}
          <div className="flex items-center gap-1 border-t border-border/40 px-3 overflow-x-auto no-scrollbar">
            <TabButton 
              active={activeTab === "thoughts"} 
              onClick={() => handleTabChange("thoughts")} 
              icon={<MessageSquare className="w-3.5 h-3.5" />}
              label="Pensées" 
              count={rootThoughts.length} 
            />
            <TabButton 
              active={activeTab === "with_replies"} 
              onClick={() => handleTabChange("with_replies")} 
              icon={<MessageSquare className="w-3.5 h-3.5 opacity-60" />}
              label="Réponses" 
              count={replyThoughts.length} 
            />
            <TabButton 
              active={activeTab === "articles"} 
              onClick={() => handleTabChange("articles")} 
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Articles" 
              count={articlesList.length} 
            />
            <TabButton 
              active={activeTab === "reposts"} 
              onClick={() => handleTabChange("reposts")} 
              icon={<Repeat className="w-3.5 h-3.5" />}
              label="Reposts" 
              count={repostsList.length} 
            />
            <TabButton 
              active={activeTab === "media"} 
              onClick={() => handleTabChange("media")} 
              icon={<ImageIcon className="w-3.5 h-3.5" />}
              label="Médias" 
              count={mediaThoughts.length} 
            />
          </div>
        </div>

        {/* Tab Content Stream — Instant, Snappy Rendering without Fade Lag */}
        <div className="space-y-4">
          {activeTab === "thoughts" && (
            <div className="space-y-2">
              {rootThoughts.length === 0 ? (
                <EmptyTabMessage message="Aucune pensée originale publiée pour le moment." />
              ) : (
                rootThoughts.map((post: any) => (
                  <ThoughtCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    onOpenPost={(id, authorUsername) => {
                      const handle = authorUsername || user.username || user.subdomain || user.id
                      window.location.href = routes.feed.thought(handle, id)
                    }}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === "with_replies" && (
            <div className="space-y-2">
              {replyThoughts.length === 0 ? (
                <EmptyTabMessage message="Aucune réponse publiée pour le moment." />
              ) : (
                replyThoughts.map((post: any) => (
                  <ThoughtCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    onOpenPost={(id, authorUsername) => {
                      const handle = authorUsername || user.username || user.subdomain || user.id
                      window.location.href = routes.feed.thought(handle, id)
                    }}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === "articles" && (
            <div className="space-y-2">
              {articlesList.length === 0 ? (
                <EmptyTabMessage message="Aucun article rédigé pour le moment." />
              ) : (
                articlesList.map((article: any, idx: number) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    idx={idx}
                    dbUser={{ id: currentUserId }}
                    isBookmarked={false}
                    isFollowed={isFollowing}
                    handleFollowToggle={handleFollowToggle}
                    handleBookmarkToggle={() => {}}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === "reposts" && (
            <div className="space-y-2">
              {repostsList.length === 0 ? (
                <EmptyTabMessage message="Aucun contenu repartagé." />
              ) : (
                repostsList.map((post: any) => (
                  <ThoughtCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    onOpenPost={(id, authorUsername) => {
                      const handle = authorUsername || post.author?.username || post.author?.subdomain || user.username || user.subdomain || user.id
                      window.location.href = routes.feed.thought(handle, id)
                    }}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === "media" && (
            <div className="space-y-2">
              {mediaThoughts.length === 0 ? (
                <EmptyTabMessage message="Aucun média partagé." />
              ) : (
                mediaThoughts.map((post: any) => (
                  <ThoughtCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    onOpenPost={(id, authorUsername) => {
                      const handle = authorUsername || user.username || user.subdomain || user.id
                      window.location.href = routes.feed.thought(handle, id)
                    }}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isOwnProfile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          user={user}
          onProfileUpdated={(updatedUser) => {
            setUser((prev: any) => ({
              ...prev,
              ...updatedUser
            }))
          }}
        />
      )}
    </ReaderPageLayout>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap",
        active 
          ? "border-foreground text-foreground" 
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{count}</span>}
    </button>
  )
}

function EmptyTabMessage({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-xs text-muted-foreground italic bg-card/40 border border-border/30 rounded-xl">
      {message}
    </div>
  )
}
