"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Trash2, Loader2, Image, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFeedStore } from "@/lib/use-feed-store"

interface MicroPostComposerProps {
  dbUser: any
  tagsList: string[]
}

export function MicroPostComposer({
  dbUser,
  tagsList,
}: MicroPostComposerProps) {
  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false)
  const [postText, setPostText] = useState<string>("")
  const [postImageUrls, setPostImageUrls] = useState<string[]>([])
  const [uploadingPostImage, setUploadingPostImage] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Load draft from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("qoe_micro_post_draft")
    if (saved) {
      setPostText(saved)
      setIsComposerExpanded(true)
    }
  }, [])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setPostText(val)
    localStorage.setItem("qoe_micro_post_draft", val)
    if (val.trim()) {
      setIsComposerExpanded(true)
    }
  }

  const CHAR_LIMIT = 280
  const isOverLimit = postText.length > CHAR_LIMIT
  const charsRemaining = CHAR_LIMIT - postText.length
  
  // Radial calculations
  const radius = 9
  const circumference = 2 * Math.PI * radius
  const percentage = Math.min((postText.length / CHAR_LIMIT) * 100, 100)
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  // Client-side premium image compression
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new window.Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement("canvas")
          let width = img.width
          let height = img.height

          const MAX_WIDTH = 1600
          const MAX_HEIGHT = 1600

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width)
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height)
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext("2d")
          if (!ctx) {
            resolve(file)
            return
          }

          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob)
              } else {
                resolve(file)
              }
            },
            "image/jpeg",
            0.82
          )
        }
        img.onerror = (err) => reject(err)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  const handlePostImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    if (postImageUrls.length + files.length > 4) {
      alert("Vous pouvez ajouter jusqu'à 4 images maximum par post.")
      return
    }

    setUploadingPostImage(true)
    setSubmitError(null)

    try {
      const uploadedUrls: string[] = []

      for (const file of files) {
        // Validate file size: 4MB max before compression
        if (file.size > 4 * 1024 * 1024) {
          alert(`L'image ${file.name} dépasse la limite de 4 Mo.`)
          continue
        }

        const compressedBlob = await compressImage(file)
        const compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
          type: "image/jpeg"
        })

        const formData = new FormData()
        formData.append("file", compressedFile)

        const uploadRes = await fetch("/api/articles/upload", {
          method: "POST",
          body: formData
        })
        const uploadData = await uploadRes.json()

        if (uploadRes.ok && uploadData.url) {
          uploadedUrls.push(uploadData.url)
        } else {
          setSubmitError(uploadData.error || "Une erreur est survenue lors de l'upload.")
        }
      }

      setPostImageUrls(prev => [...prev, ...uploadedUrls])
    } catch (err) {
      console.error(err)
      setSubmitError("Erreur de connexion lors du téléversement.")
    } finally {
      setUploadingPostImage(false)
    }
  }

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!postText.trim() || !dbUser || isSubmitting || isOverLimit) return

    setSubmitError(null)
    setIsSubmitting(true)
    const tags = postText.match(/#[a-zA-Z0-9_-]+/g) || []

    const imagePayload = postImageUrls.length > 0 ? JSON.stringify(postImageUrls) : null

    try {
      const { createMicroPost } = await import("../actions")
      const res = await createMicroPost({ content: postText, tags, imageUrl: imagePayload })
      if (res.success && res.data?.post) {
        const post = res.data.post
        
        useFeedStore.getState().addLocalPost({
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
          category: { name: "Micro-post" },
          tags: post.tags || []
        })

        setPostText("")
        setPostImageUrls([])
        localStorage.removeItem("qoe_micro_post_draft")
        setIsComposerExpanded(false)
      } else {
        setSubmitError("Impossible de publier la pensée. Veuillez réessayer.")
      }
    } catch (err) {
      setSubmitError("Erreur de connexion avec le serveur. Veuillez réessayer.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const insertHashtag = (tag: string) => {
    const nextText = postText + (postText ? " " : "") + tag
    setPostText(nextText)
    localStorage.setItem("qoe_micro_post_draft", nextText)
  }

  return (
    <div className="pb-6 border-b border-[var(--border-default)] flex flex-col gap-4">
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
          onChange={handleTextChange}
          onFocus={() => setIsComposerExpanded(true)}
          disabled={isSubmitting}
          className={cn(
            "w-full font-serif text-[15px] focus:outline-none resize-none transition-all duration-300",
            "placeholder:text-[var(--text-quaternary)] text-[var(--text-primary)]",
            "bg-transparent border-0 p-0 focus:ring-0 leading-relaxed",
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
              {submitError && (
                <div className="bg-red-50 text-[var(--qoe-vermillion)] text-[11px] font-semibold p-3 rounded-[var(--radius-button)] flex items-center gap-2 border border-red-100/50">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {uploadingPostImage && (
                <div className="relative overflow-hidden bg-[var(--surface-1)] border border-[var(--border-default)] h-16 flex items-center justify-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--qoe-vermillion)]" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">Téléchargement de l'image...</span>
                  <div className="absolute bottom-0 left-0 h-0.5 bg-[var(--qoe-vermillion)] animate-pulse w-full" />
                </div>
              )}

              {postImageUrls.length > 0 && !uploadingPostImage && (
                <div className={cn(
                  "grid gap-2",
                  postImageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
                )}>
                  {postImageUrls.map((url, index) => (
                    <div key={url} className="relative aspect-video bg-neutral-100 border border-neutral-200/40 group">
                      <img src={url} className="w-full h-full object-cover" alt="" />
                      <button
                        type="button"
                        onClick={() => setPostImageUrls(prev => prev.filter((_, i) => i !== index))}
                        className="absolute top-2 right-2 bg-neutral-900/80 hover:bg-neutral-900 text-white p-2 transition-all shadow-md cursor-pointer rounded-[var(--radius-button)]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-3.5 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer p-2 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all flex items-center justify-center">
                    <Image className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      multiple
                      onChange={handlePostImageUpload}
                      disabled={uploadingPostImage || isSubmitting || postImageUrls.length >= 4}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  {/* Radial Character Counter */}
                  {postText.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {charsRemaining <= 30 && (
                        <span className={cn(
                          "text-[10px] font-bold font-mono transition-colors",
                          isOverLimit ? "text-[var(--qoe-vermillion)]" : "text-amber-500"
                        )}>
                          {charsRemaining}
                        </span>
                      )}
                      <svg className="w-5 h-5 transform -rotate-90">
                        <circle
                          cx="10"
                          cy="10"
                          r={radius}
                          className="stroke-[var(--border-default)]"
                          strokeWidth="2"
                          fill="transparent"
                        />
                        <circle
                          cx="10"
                          cy="10"
                          r={radius}
                          className={cn(
                            "transition-all duration-150",
                            isOverLimit
                              ? "stroke-[var(--qoe-vermillion)]"
                              : charsRemaining <= 30
                              ? "stroke-amber-500"
                              : "stroke-neutral-400"
                          )}
                          strokeWidth="2"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="transparent"
                        />
                      </svg>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsComposerExpanded(false)
                      setPostImageUrls([])
                      setPostText("")
                      localStorage.removeItem("qoe_micro_post_draft")
                    }}
                    className="px-3.5 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-xs font-semibold text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!postText.trim() || uploadingPostImage || isSubmitting || isOverLimit}
                    className="bg-[var(--qoe-vermillion)] text-white hover:bg-[#d63d20] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-quaternary)] transition-all duration-300 px-4 py-2 rounded-[var(--radius-button)] text-xs font-bold flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none"
                    style={{ boxShadow: "0 2px 8px var(--qoe-vermillion-glow)" }}
                  >
                    {isSubmitting ? (
                      <>
                        Envoi... <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </>
                    ) : (
                      <>
                        Publier <Send className="w-3 h-3" />
                      </>
                    )}
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
