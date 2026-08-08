"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Trash2, Loader2, Image, AlertCircle, Globe, Calendar as CalendarIcon, AlertTriangle, FileText, Crop as CropIcon, RefreshCw, ArrowLeft, ArrowRight, X } from "lucide-react"
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop"
import type { Crop, PixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { cn } from "@qoe/utils"

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { TimePickerInput } from "@/components/ui/time-picker/time-picker-input"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

interface ComposerImage {
  id: string
  url: string
  file?: File
  isUploading?: boolean
}

const getImages = (url: string | null | undefined): string[] => {
  if (!url) return []
  if (url.startsWith("[")) {
    try {
      return JSON.parse(url)
    } catch (e) {
      return [url]
    }
  }
  return [url]
}

interface MicroPostComposerProps {
  dbUser: any
  tagsList: string[]
  onPostCreated?: (post: any) => void
  onLoginRequired?: () => void
}

export function MicroPostComposer({
  dbUser,
  tagsList,
  onPostCreated,
  onLoginRequired,
}: MicroPostComposerProps) {
  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false)
  const [postText, setPostText] = useState<string>("")
  const [images, setImages] = useState<ComposerImage[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Drafts states
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null)
  const [isDraftsOpen, setIsDraftsOpen] = useState(false)
  const [drafts, setDrafts] = useState<any[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)

  // Popover controls
  const [showVisibilityDropdown, setShowVisibilityDropdown] = useState<boolean>(false)
  const [showScheduleDropdown, setShowScheduleDropdown] = useState<boolean>(false)
  const [showWarningDropdown, setShowWarningDropdown] = useState<boolean>(false)
  const [overflowStyle, setOverflowStyle] = useState<"hidden" | "visible">("hidden")

  // Publishing options state
  const [visibility, setVisibility] = useState<string>("public")
  const [isScheduled, setIsScheduled] = useState<boolean>(false)
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined)
  const [isTriggerWarning, setIsTriggerWarning] = useState<boolean>(false)
  const [triggerWarning, setTriggerWarning] = useState<string>("")
  const [isDraft, setIsDraft] = useState<boolean>(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const hourRef = useRef<HTMLInputElement>(null)
  const minuteRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null)
  const [croppingImage, setCroppingImage] = useState<ComposerImage | null>(null)
  const [showDraftPopover, setShowDraftPopover] = useState<boolean>(false)

  // Load draft from localStorage on mount
  useEffect(() => {
    if (!dbUser) return
    const saved = localStorage.getItem("qoe_micro_post_draft")
    if (saved) {
      setPostText(saved)
      setIsComposerExpanded(true)
    }
  }, [dbUser])

  // Auto-grow height logic
  useEffect(() => {
    if (textareaRef.current && isComposerExpanded) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [postText, isComposerExpanded])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!dbUser) {
      if (onLoginRequired) {
        onLoginRequired()
      }
      return
    }
    const val = e.target.value
    setPostText(val)
    localStorage.setItem("qoe_micro_post_draft", val)
    if (val.trim()) {
      setIsComposerExpanded(true)
    }
  }

  const CHAR_LIMIT = 280
  const getUrls = (text: string) => {
    const urlRegex = /https?:\/\/[^\s]+/gi
    return text.match(urlRegex) || []
  }
  const calculateCharacters = (text: string) => {
    const urls = getUrls(text)
    let len = text.length
    for (const url of urls) {
      len -= url.length
      const isInternal = url.includes("/post/") || url.includes("/article/")
      if (!isInternal) {
        len += 20
      }
    }
    return len
  }

  const currentLength = calculateCharacters(postText)
  const isOverLimit = currentLength > CHAR_LIMIT
  const charsRemaining = CHAR_LIMIT - currentLength

  // Radial calculations
  const radius = 9
  const circumference = 2 * Math.PI * radius
  const percentage = Math.min((currentLength / CHAR_LIMIT) * 100, 100)
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

  const processAndAddFile = async (file: File, replaceId?: string) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error(`L'image ${file.name} dépasse la limite de 8 Mo.`)
      return
    }

    const tempId = replaceId || crypto.randomUUID()
    const initialBlobUrl = URL.createObjectURL(file)

    if (replaceId) {
      setImages(prev => prev.map(img => img.id === replaceId ? { ...img, url: initialBlobUrl, file } : img))
    } else {
      setImages(prev => [...prev, { id: tempId, url: initialBlobUrl, file }])
    }

    try {
      const compressedBlob = await compressImage(file)
      const compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
        type: "image/jpeg"
      })
      const compressedBlobUrl = URL.createObjectURL(compressedBlob)

      setImages(prev => prev.map(img => {
        if (img.id === tempId) {
          if (img.url.startsWith("blob:")) {
            URL.revokeObjectURL(img.url)
          }
          return { ...img, url: compressedBlobUrl, file: compressedFile }
        }
        return img
      }))
    } catch (err) {
      console.error("Compression error:", err)
    }
  }

  const handlePostImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    if (images.length + files.length > 4) {
      toast.error("Vous pouvez ajouter jusqu'à 4 images maximum par post.")
      return
    }

    setSubmitError(null)

    for (const file of files) {
      await processAndAddFile(file)
    }
    e.target.value = ""
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      if (images.length + files.length > 4) {
        toast.error("Vous pouvez ajouter jusqu'à 4 images maximum par post.")
        return
      }
      setSubmitError(null)
      for (const file of files) {
        await processAndAddFile(file)
      }
    }
  }

  const handleReplaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && replacingImageId) {
      await processAndAddFile(file, replacingImageId)
      setReplacingImageId(null)
    }
    e.target.value = ""
  }

  const moveImage = (index: number, direction: "left" | "right") => {
    const nextIndex = direction === "left" ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= images.length) return

    setImages(prev => {
      const newImages = [...prev]
      const temp = newImages[index]
      newImages[index] = newImages[nextIndex]
      newImages[nextIndex] = temp
      return newImages
    })
  }

  const getScheduledDateTimeString = () => {
    if (!scheduledDate) return null
    return scheduledDate.toISOString()
  }

  const handleLoadDraft = (draft: any) => {
    setPostText(draft.content)
    
    const imageUrls = getImages(draft.imageUrl)
    const composerImages = imageUrls.map(url => ({
      id: crypto.randomUUID(),
      url,
      isUploading: false
    }))
    setImages(composerImages)

    setVisibility(draft.visibility || "public")
    setIsScheduled(!!draft.scheduledAt)
    setScheduledDate(draft.scheduledAt ? new Date(draft.scheduledAt) : undefined)
    setIsTriggerWarning(!!draft.triggerWarning)
    setTriggerWarning(draft.triggerWarning || "")
    
    setLoadedDraftId(draft.id)
    setIsComposerExpanded(true)
    setIsDraftsOpen(false)

    localStorage.setItem("qoe_micro_post_draft", draft.content)
    toast.success("Brouillon chargé dans l'éditeur.")
  }

  const handleDeleteDraft = async (draftId: string) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId))
    if (loadedDraftId === draftId) {
      setLoadedDraftId(null)
    }

    try {
      const { deletePost } = await import("../actions")
      const res = await deletePost(draftId)
      if (res.ok) {
        toast.success("Brouillon supprimé.")
      } else {
        toast.error("Impossible de supprimer le brouillon.")
        loadDrafts()
      }
    } catch (err) {
      console.error(err)
      toast.error("Erreur réseau lors de la suppression.")
      loadDrafts()
    }
  }

  const loadDrafts = async () => {
    setLoadingDrafts(true)
    try {
      const { getUserDrafts } = await import("../actions")
      const res = await getUserDrafts()
      if (res.ok && res.data?.drafts) {
        setDrafts(res.data.drafts)
      } else {
        setDrafts([])
      }
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors de la récupération des brouillons.")
    } finally {
      setLoadingDrafts(false)
    }
  }

  useEffect(() => {
    if (isDraftsOpen) {
      loadDrafts()
    }
  }, [isDraftsOpen])

  const uploadComposerImages = async (composerImages: ComposerImage[]): Promise<string[]> => {
    const uploadedUrls: string[] = []
    for (const img of composerImages) {
      if (!img.file) {
        uploadedUrls.push(img.url)
        continue
      }
      const formData = new FormData()
      formData.append("file", img.file)
      const res = await fetch("/api/articles/upload", {
        method: "POST",
        body: formData
      })
      if (!res.ok) {
        throw new Error("Erreur lors de l'envoi d'une image au serveur.")
      }
      const data = await res.json()
      if (!data.url) {
        throw new Error("L'upload de l'image a échoué.")
      }
      uploadedUrls.push(data.url)
    }
    return uploadedUrls
  }

  const handlePostSubmit = async (e: React.FormEvent, forceDraft?: boolean) => {
    e.preventDefault()
    const textContent = postText.trim()
    const isDraftSubmit = forceDraft !== undefined ? forceDraft : isDraft
    
    if ((!textContent && images.length === 0) || !dbUser || isSubmitting || isOverLimit) return

    setSubmitError(null)
    setIsSubmitting(true)

    try {
      const uploadedUrls = await uploadComposerImages(images)
      const imagePayload = uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null
      const tags = textContent.match(/#[a-zA-Z0-9_-]+/g) || []

      const { createMicroPost } = await import("../actions")
      const res = await createMicroPost({
        content: textContent,
        tags,
        imageUrl: imagePayload,
        visibility,
        isDraft: isDraftSubmit,
        scheduledAt: isScheduled && scheduledDate ? getScheduledDateTimeString() : null,
        triggerWarning: isTriggerWarning && triggerWarning.trim() ? triggerWarning.trim() : null
      })

      if (res.ok && res.data?.post) {
        const post = res.data.post
        
        images.forEach(img => {
          if (img.url.startsWith("blob:")) {
            URL.revokeObjectURL(img.url)
          }
        })
        
        if (loadedDraftId) {
          try {
            const { deletePost } = await import("../actions")
            await deletePost(loadedDraftId)
          } catch (err) {
            console.error("Failed to delete original draft post after publishing:", err)
          }
          setLoadedDraftId(null)
        }
        
        const isFuture = isScheduled && scheduledDate && new Date(getScheduledDateTimeString() || "") > new Date()
        if (!isDraftSubmit && !isFuture && onPostCreated) {
          onPostCreated({
            id: post.id,
            title: "",
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
        }

        toast.success(isDraftSubmit ? "Brouillon enregistré." : "Pensée publiée.")

        setPostText("")
        setImages([])
        setVisibility("public")
        setIsScheduled(false)
        setScheduledDate(undefined)
        setIsTriggerWarning(false)
        setTriggerWarning("")
        setIsDraft(false)
        setShowVisibilityDropdown(false)
        setShowScheduleDropdown(false)
        setShowWarningDropdown(false)
        setOverflowStyle("hidden")
        localStorage.removeItem("qoe_micro_post_draft")
        setIsComposerExpanded(false)
      } else {
        setSubmitError("Impossible de publier la pensée. Veuillez réessayer.")
        toast.error("Impossible de publier la pensée. Veuillez réessayer.")
      }
    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || "Erreur de connexion avec le serveur. Veuillez réessayer.")
      toast.error(err.message || "Erreur de connexion avec le serveur. Veuillez réessayer.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="pb-6 border-b border-[var(--border-subtle)] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-sm overflow-hidden border border-[var(--border-default)] shrink-0">
          {dbUser?.logoUrl ? (
            <img src={dbUser.logoUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-[var(--qoe-vermillion)] text-[10px]">
              {dbUser?.name?.charAt(0).toUpperCase() || "L"}
            </div>
          )}
        </div>
        <span className="text-xs font-semibold text-foreground/80 tracking-tight">Partagez une pensée</span>
      </div>

      <form onSubmit={(e) => handlePostSubmit(e)} className="space-y-3.5">
        <textarea
          ref={textareaRef}
          placeholder="Quelle est votre pensée du jour ?"
          value={postText}
          onChange={handleTextChange}
          onFocus={() => {
            if (!dbUser) {
              textareaRef.current?.blur()
              if (onLoginRequired) {
                onLoginRequired()
              }
              return
            }
            setIsComposerExpanded(true)
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault()
              handlePostSubmit(e)
            } else if (e.key === "Escape") {
              setIsComposerExpanded(false)
              setImages([])
              setPostText("")
              setVisibility("public")
              setIsScheduled(false)
              setScheduledDate(undefined)
              setIsTriggerWarning(false)
              setTriggerWarning("")
              setIsDraft(false)
              setShowVisibilityDropdown(false)
              setShowScheduleDropdown(false)
              setShowWarningDropdown(false)
              setOverflowStyle("hidden")
              localStorage.removeItem("qoe_micro_post_draft")
            }
          }}
          onPaste={handlePaste}
          disabled={isSubmitting}
          className={cn(
            "w-full font-sans text-sm focus:outline-none resize-none transition-all duration-200",
            "placeholder:text-muted-foreground/60 text-foreground font-normal",
            "bg-transparent border-0 p-0 focus:ring-0 leading-relaxed",
            isComposerExpanded ? "" : "h-12"
          )}
          style={{ height: isComposerExpanded ? "auto" : "48px" }}
        />

        <AnimatePresence>
          {isComposerExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onAnimationStart={() => setOverflowStyle("hidden")}
              onAnimationComplete={() => {
                if (isComposerExpanded) setOverflowStyle("visible")
              }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex flex-col gap-3.5"
              style={{ overflow: overflowStyle }}
            >
              {submitError && (
                <div className="bg-red-50 text-[var(--qoe-vermillion)] text-[11px] font-semibold p-3 rounded-[var(--radius-button)] flex items-center gap-2 border border-red-100/50">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {images.length > 0 && (
                <div className={cn(
                  "grid gap-2",
                  images.length === 1 ? "grid-cols-1" : "grid-cols-2"
                )}>
                  <AnimatePresence initial={false}>
                    {images.map((img, idx) => (
                      <motion.div
                        key={img.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className="relative aspect-video bg-neutral-100 border border-neutral-200/40 group overflow-hidden rounded-[var(--radius-button)]"
                      >
                        <img
                          src={img.url}
                          className={cn(
                            "w-full h-full object-cover transition-all duration-500",
                            img.isUploading ? "blur-md scale-95" : "blur-0 scale-100"
                          )}
                          alt=""
                        />

                        {/* Premium Hover Actions Overlay */}
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2.5 z-10">
                          <div className="flex items-center justify-between w-full">
                            {/* Reorder actions */}
                            <div className="flex items-center gap-1">
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => moveImage(idx, "left")}
                                  className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                  title="Déplacer vers la gauche"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {idx < images.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => moveImage(idx, "right")}
                                  className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                  title="Déplacer vers la droite"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Crop & Replace actions */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setCroppingImage(img)}
                                className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                title="Recadrer l'image"
                              >
                                <CropIcon className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReplacingImageId(img.id)
                                  replaceInputRef.current?.click()
                                }}
                                className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                title="Remplacer l'image"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                              className="bg-red-600/80 hover:bg-red-700 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                              title="Supprimer l'image"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Hidden file input for replacement */}
              <input
                type="file"
                ref={replaceInputRef}
                onChange={handleReplaceImage}
                accept="image/*"
                className="hidden"
              />

              <div className="flex items-center justify-between pt-3.5 border-t border-[var(--border-subtle)] bg-transparent">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer p-2 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all flex items-center justify-center" title="Ajouter des images">
                    <Image className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      multiple
                      onChange={handlePostImageUpload}
                      disabled={isSubmitting || images.length >= 4}
                    />
                  </label>

                  {/* 1. Visibilité Dropdown (Shadcn Popover) */}
                  <Popover open={showVisibilityDropdown} onOpenChange={setShowVisibilityDropdown}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className={cn(
                            "p-2 rounded-[var(--radius-button)] border transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs text-[var(--text-secondary)]",
                            visibility !== "public"
                              ? "bg-[var(--surface-2)] border-[var(--border-default)] text-[var(--text-primary)]"
                              : "border-transparent bg-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                          )}
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>{visibility === "public" ? "Public" : "Followers"}</span>
                        </button>
                      }
                    />
                    <PopoverContent align="start" className="w-44 p-1.5 space-y-0.5 bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-button)] shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setVisibility("public")
                          setShowVisibilityDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors",
                          visibility === "public" ? "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium" : "hover:bg-[var(--surface-1)] text-[var(--text-secondary)]"
                        )}
                      >
                        Tout le monde
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVisibility("followers")
                          setShowVisibilityDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors",
                          visibility === "followers" ? "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium" : "hover:bg-[var(--surface-1)] text-[var(--text-secondary)]"
                        )}
                      >
                        Followers uniquement
                      </button>
                    </PopoverContent>
                  </Popover>

                  {/* 2. Planification Dropdown (Shadcn Popover & Calendar) */}
                  <Popover open={showScheduleDropdown} onOpenChange={(open) => {
                    setShowScheduleDropdown(open)
                    if (open && !scheduledDate) {
                      const now = new Date()
                      setScheduledDate(now)
                      setIsScheduled(true)
                    }
                  }}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className={cn(
                            "p-2 rounded-[var(--radius-button)] border transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs text-[var(--text-secondary)]",
                            isScheduled
                              ? "bg-[var(--qoe-vermillion-08)] border-[var(--qoe-vermillion)] text-[var(--qoe-vermillion)]"
                              : "border-transparent bg-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                          )}
                          title="Planifier"
                        >
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {isScheduled && <span className="text-[10px] text-[var(--text-primary)] font-medium">Planifié</span>}
                        </button>
                      }
                    />
                    <PopoverContent align="start" className="w-auto p-3.5 flex flex-col gap-3.5 bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-button)] shadow-lg z-50">
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] block">Date de publication</span>
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={(dateVal) => {
                            if (!dateVal) {
                              setScheduledDate(undefined)
                              return
                            }
                            if (!scheduledDate) {
                              const now = new Date()
                              const newDate = new Date(dateVal)
                              newDate.setHours(now.getHours())
                              newDate.setMinutes(now.getMinutes())
                              setScheduledDate(newDate)
                            } else {
                              const newDate = new Date(dateVal)
                              newDate.setHours(scheduledDate.getHours())
                              newDate.setMinutes(scheduledDate.getMinutes())
                              newDate.setSeconds(scheduledDate.getSeconds())
                              setScheduledDate(newDate)
                            }
                            setIsScheduled(true)
                          }}
                          disabled={{ before: new Date() }}
                          className="rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-0)]"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs gap-4">
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">Heure de publication</span>
                        <div className="flex items-center gap-1">
                          <TimePickerInput
                            picker="hours"
                            date={scheduledDate}
                            setDate={setScheduledDate}
                            ref={hourRef}
                            onRightFocus={() => minuteRef.current?.focus()}
                            className="w-10 h-7 text-xs border-[var(--border-default)] bg-[var(--surface-1)] rounded-[var(--radius-button)] text-center focus:border-[var(--qoe-vermillion)] outline-none"
                          />
                          <span className="text-[var(--text-tertiary)]">:</span>
                          <TimePickerInput
                            picker="minutes"
                            date={scheduledDate}
                            setDate={setScheduledDate}
                            ref={minuteRef}
                            onLeftFocus={() => hourRef.current?.focus()}
                            className="w-10 h-7 text-xs border-[var(--border-default)] bg-[var(--surface-1)] rounded-[var(--radius-button)] text-center focus:border-[var(--qoe-vermillion)] outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => {
                            setIsScheduled(false)
                            setScheduledDate(undefined)
                            setShowScheduleDropdown(false)
                          }}
                          className="px-3 py-1.5 border border-[var(--border-default)] rounded-[var(--radius-button)] text-[10px] font-semibold hover:bg-[var(--surface-2)] text-[var(--text-secondary)]"
                        >
                          Réinitialiser
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowScheduleDropdown(false)}
                          className="px-3 py-1.5 bg-[var(--qoe-vermillion)] hover:bg-[#d63d20] text-white rounded-[var(--radius-button)] text-[10px] font-bold"
                        >
                          Valider
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* 3. Avertissement Dropdown (Shadcn Popover) */}
                  <Popover open={showWarningDropdown} onOpenChange={setShowWarningDropdown}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className={cn(
                            "p-2 rounded-[var(--radius-button)] border transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs text-[var(--text-secondary)]",
                            isTriggerWarning
                              ? "bg-amber-500/10 border-amber-500 text-amber-600"
                              : "border-transparent bg-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                          )}
                          title="Avertissement"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {isTriggerWarning && <span className="text-[10px] text-[var(--text-primary)] font-medium">Masqué</span>}
                        </button>
                      }
                    />
                    <PopoverContent align="start" className="w-60 p-3.5 space-y-3 bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-button)] shadow-lg z-50 text-xs">
                      <label className="flex items-center justify-between cursor-pointer text-xs text-[var(--text-secondary)]">
                        <span>Masquer le contenu</span>
                        <input
                           type="checkbox"
                           checked={isTriggerWarning}
                           onChange={(e) => setIsTriggerWarning(e.target.checked)}
                           className="accent-[var(--qoe-vermillion)] cursor-pointer"
                        />
                      </label>
                      {isTriggerWarning && (
                        <input
                          type="text"
                          placeholder="Motif (ex: Spoilers, Sensible)"
                          value={triggerWarning}
                          onChange={(e) => setTriggerWarning(e.target.value)}
                          className="w-full bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-button)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] outline-none focus:border-[var(--qoe-vermillion)] mt-1.5"
                        />
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center gap-3">
                  {/* Radial Character Counter */}
                  {postText.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {charsRemaining <= 30 && (
                        <span className={cn(
                          "text-[10px] font-bold transition-colors",
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

                  {/* Unified Drafts Popover */}
                  <Popover open={showDraftPopover} onOpenChange={setShowDraftPopover}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="px-3.5 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-2)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none transition-colors"
                        >
                          Brouillons
                        </button>
                      }
                    />
                    <PopoverContent align="end" className="w-56 p-1.5 space-y-0.5 bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-button)] shadow-lg z-50">
                      <button
                        type="button"
                        disabled={!postText.trim() && images.length === 0}
                        onClick={(e) => {
                          setShowDraftPopover(false)
                          handlePostSubmit(e, true)
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors hover:bg-[var(--surface-1)] text-[var(--text-secondary)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer font-serif"
                      >
                        Enregistrer le brouillon actuel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDraftPopover(false)
                          setIsDraftsOpen(true)
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors hover:bg-[var(--surface-1)] text-[var(--text-secondary)] cursor-pointer font-serif"
                      >
                        Voir tous les brouillons
                      </button>
                    </PopoverContent>
                  </Popover>

                  <button
                    type="button"
                    onClick={() => {
                      setIsComposerExpanded(false)
                      setImages([])
                      setPostText("")
                      setLoadedDraftId(null)
                      setVisibility("public")
                      setIsScheduled(false)
                      setScheduledDate(undefined)
                      setIsTriggerWarning(false)
                      setTriggerWarning("")
                      setIsDraft(false)
                      setShowVisibilityDropdown(false)
                      setShowScheduleDropdown(false)
                      setShowWarningDropdown(false)
                      setOverflowStyle("hidden")
                      localStorage.removeItem("qoe_micro_post_draft")
                    }}
                    className="px-3.5 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-xs font-semibold text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none transition-colors"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={(!postText.trim() && images.length === 0) || isSubmitting || isOverLimit}
                    className="bg-[var(--qoe-vermillion)] text-white hover:bg-[#d63d20] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-quaternary)] transition-all duration-300 px-4 py-2 rounded-[var(--radius-button)] text-xs font-bold flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none animate-fade-in"
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

      <Sheet open={isDraftsOpen} onOpenChange={setIsDraftsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col h-full bg-[var(--surface-0)] border-l border-[var(--border-default)] z-[60]">
          <SheetHeader className="p-6 border-b border-[var(--border-subtle)]">
            <SheetTitle className="text-base font-bold text-[var(--text-primary)]">Mes Brouillons</SheetTitle>
            <SheetDescription className="text-xs text-[var(--text-tertiary)]">
              Retrouvez et modifiez vos pensées enregistrées.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loadingDrafts ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--qoe-vermillion)]" />
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Chargement des brouillons...</span>
              </div>
            ) : drafts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <FileText className="w-8 h-8 text-[var(--text-quaternary)]" />
                <p className="text-xs text-[var(--text-secondary)] font-serif">Vous n'avez aucun brouillon pour le moment.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {drafts.map(draft => (
                  <div
                    key={draft.id}
                    className="group border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-all duration-300 flex flex-col justify-between gap-3 relative"
                  >
                    <div className="space-y-1 pr-8">
                      <p className="text-[13px] text-[var(--text-primary)] font-serif leading-relaxed line-clamp-3 whitespace-pre-wrap">
                        {draft.content}
                      </p>
                      
                      <div className="flex flex-wrap gap-2 pt-1.5 items-center">
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold bg-[var(--surface-2)] px-2 py-0.5 rounded-[var(--radius-button)]">
                          {draft.visibility === "public" ? "Public" : "Followers"}
                        </span>
                        {draft.scheduledAt && (
                          <span className="text-[9px] text-[var(--qoe-vermillion)] bg-[var(--qoe-vermillion-08)] px-2 py-0.5 rounded-[var(--radius-button)] font-medium">
                            Planifié
                          </span>
                        )}
                        {draft.triggerWarning && (
                          <span className="text-[9px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-[var(--radius-button)] font-medium">
                            Warning
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 mt-1">
                      <span className="text-[9px] text-[var(--text-tertiary)]">
                        Mis à jour {new Date(draft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      
                      <button
                        type="button"
                        onClick={() => handleLoadDraft(draft)}
                        className="text-[10px] font-bold text-[var(--qoe-vermillion)] hover:text-[#d63d20] bg-[var(--qoe-vermillion-08)] px-2.5 py-1 rounded-[var(--radius-button)] transition-all cursor-pointer"
                      >
                        Charger
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="absolute top-4 right-4 text-[var(--text-quaternary)] hover:text-[var(--qoe-vermillion)] transition-colors p-1.5 rounded-[var(--radius-button)] cursor-pointer"
                      title="Supprimer le brouillon"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal de Recadrage d'Image Premium */}
      <AnimatePresence>
        {croppingImage && (
          <ImageCropperModal
            image={croppingImage}
            onClose={() => setCroppingImage(null)}
            onConfirm={(croppedUrl, croppedFile) => {
              setImages(prev => prev.map(img => img.id === croppingImage.id ? { ...img, url: croppedUrl, file: croppedFile } : img))
              setCroppingImage(null)
              toast.success("Image recadrée avec succès.")
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// -------------------------------------------------------------
// Sub-component: ImageCropperModal
// -------------------------------------------------------------

interface ImageCropperModalProps {
  image: ComposerImage
  onClose: () => void
  onConfirm: (croppedUrl: string, croppedFile: File) => void
}

function ImageCropperModal({ image, onClose, onConfirm }: ImageCropperModalProps) {
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    x: 10,
    y: 10,
    width: 80,
    height: 80
  })
  const [aspectRatio, setAspectRatio] = useState<"libre" | "1:1" | "16:9">("libre")
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  
  const imgRef = useRef<HTMLImageElement>(null)

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    const aspect = aspectRatio === "1:1" ? 1 : aspectRatio === "16:9" ? 16 / 9 : undefined
    
    if (aspect) {
      const c = makeAspectCrop(
        { unit: "%", width: 80 },
        aspect,
        width,
        height
      )
      setCrop(centerCrop(c, width, height))
    } else {
      setCrop({
        unit: "%",
        x: 10,
        y: 10,
        width: 80,
        height: 80
      })
    }
  }

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    
    const aspect = aspectRatio === "1:1" ? 1 : aspectRatio === "16:9" ? 16 / 9 : undefined
    const { width, height } = img
    
    if (aspect) {
      const c = makeAspectCrop(
        { unit: "%", width: 80 },
        aspect,
        width,
        height
      )
      setCrop(centerCrop(c, width, height))
    } else {
      setCrop({
        unit: "%",
        x: 10,
        y: 10,
        width: 80,
        height: 80
      })
    }
  }, [aspectRatio])

  const handleConfirm = async () => {
    const img = imgRef.current
    if (!img || !completedCrop) return

    try {
      const canvas = document.createElement("canvas")
      const scaleX = img.naturalWidth / img.width
      const scaleY = img.naturalHeight / img.height
      
      let targetW = completedCrop.width * scaleX
      let targetH = completedCrop.height * scaleY
      
      const maxDim = 1600
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW)
          targetW = maxDim
        } else {
          targetW = Math.round((targetW * maxDim) / targetH)
          targetH = maxDim
        }
      }

      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext("2d")
      
      if (ctx) {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        
        ctx.drawImage(
          img,
          completedCrop.x * scaleX,
          completedCrop.y * scaleY,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY,
          0,
          0,
          targetW,
          targetH
        )

        canvas.toBlob((blob) => {
          if (blob) {
            const croppedUrl = URL.createObjectURL(blob)
            const croppedFile = new File([blob], `cropped-${Date.now()}.jpg`, { type: "image/jpeg" })
            onConfirm(croppedUrl, croppedFile)
          }
        }, "image/jpeg", 0.9)
      }
    } catch (err) {
      console.error("Error cropping image:", err)
      toast.error("Impossible de recadrer l'image.")
    }
  }

  const getAspectValue = () => {
    if (aspectRatio === "1:1") return 1
    if (aspectRatio === "16:9") return 16 / 9
    return undefined
  }

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-card)] w-full max-w-md overflow-hidden shadow-2xl flex flex-col animate-fade-in"
      >
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)] font-serif">Recadrer l'image</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] p-1 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-[380px] bg-neutral-950 flex items-center justify-center p-6 select-none relative overflow-hidden">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={getAspectValue()}
            className="max-w-full max-h-[60vh]"
          >
            <img
              ref={imgRef}
              src={image.url}
              alt="To crop"
              onLoad={handleImageLoad}
              className="max-w-full max-h-[60vh] object-contain"
              draggable={false}
            />
          </ReactCrop>
        </div>

        <div className="p-4 bg-[var(--surface-1)] border-t border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[var(--text-secondary)] font-medium font-serif">Format</span>
            <div className="flex gap-1.5">
              {(["libre", "1:1", "16:9"] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={cn(
                    "px-2.5 py-1 rounded-[var(--radius-button)] text-[10px] uppercase font-bold border transition-all cursor-pointer font-serif",
                    aspectRatio === ratio
                      ? "border-[var(--qoe-vermillion)] bg-[var(--qoe-vermillion-08)] text-[var(--qoe-vermillion)]"
                      : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] bg-[var(--surface-0)]"
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-2)] cursor-pointer font-serif"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-3.5 py-2 bg-[var(--qoe-vermillion)] hover:bg-[#d63d20] text-white font-bold rounded-[var(--radius-button)] text-xs cursor-pointer font-serif"
            >
              Confirmer
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
