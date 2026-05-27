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
    const res = await createMicroPost(postText, tags, postImageUrl)
    if (res.success && res.post) {
      onPostCreated({
        id: res.post.id,
        title: "", // empty title flags it as micro-post
        slug: `post-${res.post.id}`,
        content: res.post.content,
        imageUrl: res.post.imageUrl || null,
        published: true,
        isPremium: false,
        readingTime: 1,
        createdAt: res.post.createdAt,
        author: {
          ...res.post.author,
          isCertified: false
        },
        category: { name: selectedCategory },
        tags: res.post.tags || []
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
    <div className="bg-white rounded-xl p-5 border border-neutral-200/50 flex flex-col gap-3.5 shadow-xs transition-all duration-300">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md overflow-hidden border border-neutral-200/40 shrink-0">
          {dbUser?.logoUrl ? (
            <img src={dbUser.logoUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-[#EE4B2B] text-[10px]">
              {dbUser?.name?.charAt(0).toUpperCase() || "L"}
            </div>
          )}
        </div>
        <span className="text-xs font-semibold text-neutral-800">Crée un post classique</span>
      </div>

      <form onSubmit={handlePostSubmit} className="space-y-3">
        <textarea
          placeholder="Qu'avez-vous en tête aujourd'hui ?"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          onFocus={() => setIsComposerExpanded(true)}
          className={cn(
            "w-full text-[13px] font-sans focus:outline-none resize-none transition-all duration-300 placeholder-neutral-400 text-neutral-800 rounded-lg bg-neutral-50/50 border border-neutral-200/40 p-3",
            isComposerExpanded ? "h-24 focus:bg-white focus:border-[#EE4B2B]/30" : "h-11"
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
                <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 mr-1">Hashtags:</span>
                {tagsList.map(tag => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => insertHashtag(tag)}
                    className="text-[10px] bg-neutral-50 hover:bg-[#EE4B2B]/5 hover:text-[#EE4B2B] font-semibold px-2 py-0.5 rounded-md border border-neutral-200/30 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {postImageUrl && (
                <div className="relative rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200/40 max-h-48 group">
                  <img src={postImageUrl} className="w-full h-full object-cover" alt="Image jointe" />
                  <button
                    type="button"
                    onClick={() => setPostImageUrl("")}
                    className="absolute top-2 right-2 bg-neutral-900/80 hover:bg-neutral-900 text-white p-1.5 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="text-[11px] bg-neutral-50/50 hover:bg-neutral-100/50 font-semibold border border-neutral-200/60 px-2.5 py-1.5 rounded-lg text-neutral-600 focus:outline-none cursor-pointer"
                  >
                    <option value="Philosophie">Philosophie</option>
                    <option value="Politique">Politique</option>
                    <option value="Micro-post">Micro-post</option>
                    <option value="Souveraineté">Souveraineté</option>
                  </select>

                  <label className="cursor-pointer p-2 rounded-lg border border-neutral-200/60 bg-neutral-50/50 hover:bg-neutral-100/50 text-neutral-500 hover:text-neutral-700 transition-colors flex items-center justify-center">
                    {uploadingPostImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EE4B2B]" />
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
                    className="px-3.5 py-1.5 border border-neutral-200/60 rounded-lg text-xs font-semibold text-neutral-500 hover:bg-neutral-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!postText.trim() || uploadingPostImage}
                    className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] disabled:bg-neutral-50 disabled:text-neutral-400 disabled:border-neutral-200/40 disabled:shadow-none transition-colors px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
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
