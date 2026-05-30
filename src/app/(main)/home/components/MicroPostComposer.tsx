"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Trash2, Loader2, Image } from "lucide-react"
import { cn } from "@/lib/utils"

interface MicroPostComposerProps {
  dbUser: any
  tagsList: string[]
  onPostCreated: (post: any) => void
}

export function MicroPostComposer({
  dbUser,
  tagsList,
  onPostCreated,
}: MicroPostComposerProps) {
  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false)
  const [postText, setPostText] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<string>("Général")
  const [postImageUrl, setPostImageUrl] = useState<string>("")
  const [uploadingPostImage, setUploadingPostImage] = useState<boolean>(false)

  const handlePostImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPostImage(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const uploadRes = await fetch("/api/articles/upload", {
        method: "POST",
        body: formData
      })
      const uploadData = await uploadRes.json()

      if (uploadRes.ok && uploadData.url) {
        setPostImageUrl(uploadData.url)
      } else {
        alert(uploadData.error || "Une erreur est survenue lors de l'upload.")
      }
    } catch (err) {
      console.error(err)
      alert("Erreur de connexion lors du téléversement.")
    } finally {
      setUploadingPostImage(false)
    }
  }

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!postText.trim() || !dbUser) return

    const tags = postText.match(/#[a-zA-Z0-9_-]+/g) || []

    const { createMicroPost } = await import("../actions")
    const res = await createMicroPost({ content: postText, tags, imageUrl: postImageUrl })
    if (res.success && res.data?.post) {
      const post = res.data.post
      onPostCreated({
        id: post.id,
        title: "", // empty title flags it as micro-post
        slug: `post-${post.id}`,
        content: post.content,
        imageUrl: post.imageUrl || null,
        published: true,
        isPremium: false,
        readingTime: 1,
        createdAt: post.createdAt,
        author: {
          ...post.author,
          isCertified: false
        },
        category: { name: selectedCategory },
        tags: post.tags || []
      })

      setPostText("")
      setPostImageUrl("")
      setIsComposerExpanded(false)
    }
  }

  const insertHashtag = (tag: string) => {
    setPostText(prev => prev + (prev ? " " : "") + tag)
  }

  return (
    <div
      className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 border border-[var(--border-default)] flex flex-col gap-4 transition-all duration-400 ease-[0.16,1,0.3,1]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full overflow-hidden border border-[var(--border-default)] shrink-0">
          {dbUser?.logoUrl ? (
            <img src={dbUser.logoUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-[var(--qoe-vermillion)] text-[10px]">
              {dbUser?.name?.charAt(0).toUpperCase() || "L"}
            </div>
          )}
        </div>
        <span className="text-[12px] font-semibold text-[var(--text-secondary)]">Partagez une pensée</span>
      </div>

      <form onSubmit={handlePostSubmit} className="space-y-3.5">
        <textarea
          placeholder="Quelle est votre pensée du jour ?"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          onFocus={() => setIsComposerExpanded(true)}
          className={cn(
            "w-full font-serif text-[14px] focus:outline-none resize-none transition-all duration-300",
            "placeholder:text-[var(--text-quaternary)] text-[var(--text-primary)]",
            "rounded-[var(--radius-element)] bg-[var(--surface-1)] border border-[var(--border-default)]",
            "p-4 focus:ring-2 focus:ring-[var(--qoe-vermillion)]/15 focus:border-[var(--qoe-vermillion)]/30",
            "focus:bg-[var(--surface-0)] leading-relaxed",
            isComposerExpanded ? "h-28" : "h-12"
          )}
        />

        <AnimatePresence>
          {isComposerExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex flex-col gap-3.5 overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-quaternary)] mr-1 font-mono">Hashtags:</span>
                {tagsList.map(tag => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => insertHashtag(tag)}
                    className="text-[10px] bg-[var(--surface-2)] hover:bg-[var(--qoe-vermillion-08)] hover:text-[var(--qoe-vermillion)] font-semibold px-2.5 py-1 rounded-full border border-[var(--border-subtle)] transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {postImageUrl && (
                <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200/40 max-h-48 group">
                  <img src={postImageUrl} className="w-full h-full object-cover" alt="Image jointe" />
                  <button
                    type="button"
                    onClick={() => setPostImageUrl("")}
                    className="absolute top-2 right-2 bg-neutral-900/80 hover:bg-neutral-900 text-white p-2 rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-3.5 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="text-[11px] bg-[var(--surface-1)] font-semibold border border-[var(--border-default)] px-3 py-2 rounded-[var(--radius-button)] text-[var(--text-secondary)] focus:outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30"
                  >
                    <option value="Philosophie">Philosophie</option>
                    <option value="Politique">Politique</option>
                    <option value="Micro-post">Micro-post</option>
                    <option value="Souveraïneté">Souveraïneté</option>
                  </select>

                  <label className="cursor-pointer p-2 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all flex items-center justify-center">
                    {uploadingPostImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--qoe-vermillion)]" />
                    ) : (
                      <Image className="w-3.5 h-3.5" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePostImageUpload}
                      disabled={uploadingPostImage}
                    />
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsComposerExpanded(false)
                      setPostImageUrl("")
                    }}
                    className="px-3.5 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-xs font-semibold text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!postText.trim() || uploadingPostImage}
                    className="bg-[var(--qoe-vermillion)] text-white hover:bg-[#d63d20] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-quaternary)] transition-all duration-300 px-4 py-2 rounded-[var(--radius-button)] text-xs font-bold flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none"
                    style={{ boxShadow: "0 2px 8px var(--qoe-vermillion-glow)" }}
                  >
                    Publier <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  )
}
