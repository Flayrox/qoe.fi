"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Trash2, Loader2, Image, AlertCircle, Globe, Calendar as CalendarIcon, AlertTriangle, FileText, Crop as CropIcon, RefreshCw, ArrowLeft, ArrowRight, X, MessageSquare, Users, AtSign, BarChart2 } from "lucide-react"

import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop"
import type { Crop, PixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { cn } from "@qoe/utils"

import { Popover, PopoverTrigger, PopoverContent } from "@qoe/ui/ui/popover"
import { Calendar } from "@qoe/ui/ui/calendar"
import { TimePickerInput } from "@qoe/ui/ui/time-picker-input"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@qoe/ui/ui/sheet"
import { ProfileHoverCard } from "@qoe/ui/social/ProfileHoverCard"

interface ComposerImage {
  id: string
  url: string
  file?: File
  isUploading?: boolean
  altText?: string
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

import { QuotedThoughtCard } from "@/components/social/QuotedThoughtCard"
import { QuotedArticleCard, type QuotedArticleData } from "@qoe/ui/social"
import type { ThoughtData } from "@/components/social/ThoughtCard"
import { AuthorAvatar } from "@qoe/ui/ui/AuthorAvatar"
import { CertifiedBadge } from "@qoe/ui/ui/CertifiedBadge"

interface ThoughtComposerProps {
  dbUser: any
  tagsList: string[]
  quotedThought?: ThoughtData | null
  replyToThought?: ThoughtData | null
  quotedArticle?: QuotedArticleData | null
  quotedExcerpt?: string | null
  parentId?: string | null
  initialText?: string
  placeholder?: string
  onPostCreated?: (post: any) => void
  onLoginRequired?: () => void
}

export function ThoughtComposer({
  dbUser,
  tagsList,
  quotedThought: initialQuotedThought = null,
  replyToThought: initialReplyToThought = null,
  quotedArticle: initialQuotedArticle = null,
  quotedExcerpt: initialQuotedExcerpt = null,
  parentId = null,
  initialText = "",
  placeholder,
  onPostCreated,
  onLoginRequired,
}: ThoughtComposerProps) {
  const [quotedThought, setQuotedThought] = useState<ThoughtData | null>(initialQuotedThought)
  const [replyToThought, setReplyToThought] = useState<ThoughtData | null>(initialReplyToThought)
  const [quotedArticle, setQuotedArticle] = useState<QuotedArticleData | null>(initialQuotedArticle)
  const [quotedExcerpt, setQuotedExcerpt] = useState<string | null>(initialQuotedExcerpt)

  useEffect(() => {
    setQuotedThought(initialQuotedThought)
    setReplyToThought(initialReplyToThought)
    setQuotedArticle(initialQuotedArticle)
    setQuotedExcerpt(initialQuotedExcerpt)
    if (initialText) {
      setPostText(initialText)
      setIsComposerExpanded(true)
    }
    if (initialReplyToThought || initialQuotedThought || initialQuotedArticle) {
      setIsComposerExpanded(true)
    }
  }, [initialQuotedThought, initialReplyToThought, initialQuotedArticle, initialQuotedExcerpt, initialText])
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
  const [showReplyRestrictionDropdown, setShowReplyRestrictionDropdown] = useState<boolean>(false)
  const [showScheduleDropdown, setShowScheduleDropdown] = useState<boolean>(false)
  const [showWarningDropdown, setShowWarningDropdown] = useState<boolean>(false)
  const [overflowStyle, setOverflowStyle] = useState<"hidden" | "visible">("hidden")

  // Publishing options state
  const [visibility, setVisibility] = useState<string>("public")
  const [replyRestriction, setReplyRestriction] = useState<string>("everyone")
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
  const [showPollEditor, setShowPollEditor] = useState<boolean>(false)
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollDurationHours, setPollDurationHours] = useState<number>(24)



  // Universal Typeahead State (@mentions, #hashtags, :emojis:)
  const [typeaheadType, setTypeaheadType] = useState<"profile" | "tag" | "emoji" | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([])
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState<number>(0)
  const [mentionPosition, setMentionPosition] = useState<{ start: number; end: number } | null>(null)

  const EMOJI_MAP: Record<string, string> = {
    fire: "🔥",
    heart: "❤️",
    rocket: "🚀",
    sparkles: "✨",
    "100": "💯",
    thumbsup: "👍",
    check: "✅",
    star: "⭐",
    smile: "😊",
    laughing: "😂",
    clap: "👏",
    eyes: "👀",
  }

  const checkMentionTrigger = (text: string, selectionStart: number) => {
    const textBeforeCursor = text.substring(0, selectionStart)

    // 1. @Profile match
    const profileMatch = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/)
    if (profileMatch) {
      setTypeaheadType("profile")
      setMentionQuery(profileMatch[1])
      setMentionPosition({ start: selectionStart - profileMatch[0].length, end: selectionStart })
      setMentionSelectedIndex(0)
      return
    }

    // 2. #Hashtag match
    const tagMatch = textBeforeCursor.match(/#([a-zA-Z0-9_-]*)$/)
    if (tagMatch) {
      setTypeaheadType("tag")
      setMentionQuery(tagMatch[1])
      setMentionPosition({ start: selectionStart - tagMatch[0].length, end: selectionStart })
      setMentionSelectedIndex(0)
      return
    }

    // 3. :Emoji: match
    const emojiMatch = textBeforeCursor.match(/:([a-zA-Z0-9_+-]*)$/)
    if (emojiMatch) {
      setTypeaheadType("emoji")
      setMentionQuery(emojiMatch[1])
      setMentionPosition({ start: selectionStart - emojiMatch[0].length, end: selectionStart })
      setMentionSelectedIndex(0)
      return
    }

    setTypeaheadType(null)
    setMentionQuery(null)
    setMentionPosition(null)
    setMentionSuggestions([])
  }

  useEffect(() => {
    if (mentionQuery === null || typeaheadType === null) {
      setMentionSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      if (typeaheadType === "profile") {
        try {
          const { searchUsersAction } = await import("@qoe/api-client/actions/feed")
          const res = await searchUsersAction(mentionQuery)
          if (res.ok && res.data?.users) {
            setMentionSuggestions(res.data.users.map(u => ({ ...u, _type: "profile" })))
          }
        } catch (err) {
          console.error("Mention search error:", err)
        }
      } else if (typeaheadType === "tag") {
        const q = mentionQuery.toLowerCase()
        const defaultTags = tagsList.length > 0 ? tagsList : ["design", "tech", "qoe", "dev", "crypto", "ia"]
        const matches = defaultTags.filter(t => t.toLowerCase().includes(q))
        setMentionSuggestions(matches.map(tag => ({ id: tag, name: `#${tag}`, _type: "tag", value: tag })))
      } else if (typeaheadType === "emoji") {
        const q = mentionQuery.toLowerCase()
        const matches = Object.entries(EMOJI_MAP).filter(([name]) => name.includes(q))
        setMentionSuggestions(matches.map(([name, char]) => ({ id: name, name: `:${name}:`, _type: "emoji", char, value: char })))
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [mentionQuery, typeaheadType, tagsList])

  const insertMention = (item: any) => {
    if (!mentionPosition || !textareaRef.current) return
    let textToInsert = ""
    if (item._type === "profile") {
      const handle = item.username || item.subdomain || item.id.slice(0, 8)
      textToInsert = `@${handle} `
    } else if (item._type === "tag") {
      textToInsert = `#${item.value} `
    } else if (item._type === "emoji") {
      textToInsert = `${item.char} `
    }

    const before = postText.substring(0, mentionPosition.start)
    const after = postText.substring(mentionPosition.end)
    const newText = `${before}${textToInsert}${after}`
    setPostText(newText)
    setTypeaheadType(null)
    setMentionQuery(null)
    setMentionPosition(null)
    setMentionSuggestions([])
    localStorage.setItem("qoe_thought_draft", newText)

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = mentionPosition.start + textToInsert.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursor, newCursor)
      }
    }, 10)
  }

  // Load draft from localStorage on mount
  useEffect(() => {
    if (!dbUser) return
    const saved = localStorage.getItem("qoe_thought_draft") || localStorage.getItem("qoe_micro_post_draft")
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
    localStorage.setItem("qoe_thought_draft", val)
    if (val.trim()) {
      setIsComposerExpanded(true)
    }
    checkMentionTrigger(val, e.target.selectionStart || val.length)
  }

  const CHAR_LIMIT = 500
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
      const { deletePostAction } = await import("@qoe/api-client/actions/feed")
      const res = await deletePostAction(draftId)
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
      const { getUserDraftsAction } = await import("@qoe/api-client/actions/feed")
      const res = await getUserDraftsAction()
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
      const res = await fetch("/api/upload", {
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
      const attachmentPayload = images.map((img, idx) => ({
        url: uploadedUrls[idx] || img.url,
        type: "IMAGE",
        altText: img.altText || undefined,
        order: idx,
      }))

      const tags = textContent.match(/#[a-zA-Z0-9_-]+/g) || []

      const { createThoughtAction, deletePostAction } = await import("@qoe/api-client/actions/feed")
      const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean)
      const pollPayload =
        showPollEditor && validPollOptions.length >= 2
          ? { options: validPollOptions, durationHours: pollDurationHours }
          : null

      let contentToSubmit = textContent
      if (quotedArticle) {
        const subdomain = quotedArticle.author?.subdomain
        const articleUrl = subdomain
          ? `https://${subdomain}.qoe.fi/article/${quotedArticle.slug}`
          : `https://qoe.fi/article/${quotedArticle.slug}`

        if (quotedExcerpt) {
          contentToSubmit = contentToSubmit
            ? `${contentToSubmit}\n\n« ${quotedExcerpt} »\n\n${articleUrl}`
            : `« ${quotedExcerpt} »\n\n${articleUrl}`
        } else {
          contentToSubmit = contentToSubmit
            ? `${contentToSubmit}\n\n${articleUrl}`
            : articleUrl
        }
      }

      const res = await createThoughtAction({
        content: contentToSubmit,
        tags,
        imageUrl: imagePayload,
        attachments: attachmentPayload,
        visibility,
        isDraft: isDraftSubmit,
        scheduledAt: isScheduled && scheduledDate ? getScheduledDateTimeString() : null,
        triggerWarning: isTriggerWarning && triggerWarning.trim() ? triggerWarning.trim() : null,
        repostId: quotedThought?.id || null,
        parentId: replyToThought?.id || parentId || null,
        replyRestriction,
        poll: pollPayload,
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
            await deletePostAction(loadedDraftId)
          } catch (err) {
            console.error("Failed to delete original draft post after publishing:", err)
          }
          setLoadedDraftId(null)
        }

        setShowPollEditor(false)
        setPollOptions(["", ""])


        
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
              isCertified: post.author?.isCertified || false
            },
            repost: post.repost ? {
              ...post.repost,
              createdAt: post.repost.createdAt || post.createdAt,
              author: {
                ...post.repost.author,
                isCertified: post.repost.author?.isCertified || false
              }
            } : null,
            parent: post.parent ? {
              ...post.parent,
              author: {
                ...post.parent.author,
                isCertified: post.parent.author?.isCertified || false
              }
            } : null,
            category: { name: "Thought" },
            tags: post.tags || []
          })
        }

        toast.success(isDraftSubmit ? "Brouillon enregistré." : "Pensée publiée.")

        setPostText("")
        setImages([])
        setQuotedThought(null)
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
        localStorage.removeItem("qoe_thought_draft")
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

  const defaultPlaceholder = placeholder || (replyToThought || parentId ? "Poster votre réponse" : "Quelle est votre pensée du jour ?")

  return (
    <div className="pb-4 border-b border-border/30 flex flex-col gap-2 font-sans transition-all duration-200">
      {/* Reply Context Header (Twitter/X Style) */}
      {replyToThought && (
        <div className="flex flex-col gap-0 mb-2 font-sans">
          <div className="flex items-start gap-3 relative">
            <div className="flex flex-col items-center shrink-0">
              <AuthorAvatar
                user={replyToThought.author}
                size="sm"
                showBadge={false}
              />
              {/* Continuous vertical line extending down to current user avatar */}
              <div className="w-[2px] bg-border/50 flex-1 my-1 rounded-full min-h-[28px]" />
            </div>

            <div className="flex-1 min-w-0 pb-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <ProfileHoverCard user={replyToThought.author}>
                    <span className="font-bold text-foreground hover:text-brand transition-colors cursor-pointer">
                      {replyToThought.author?.name || "Auteur"}
                    </span>
                  </ProfileHoverCard>
                  {replyToThought.author?.isCertified && <CertifiedBadge />}
                  <ProfileHoverCard user={replyToThought.author}>
                    <span className="text-muted-foreground text-[11px] hover:text-brand transition-colors cursor-pointer">
                      @{replyToThought.author?.username || replyToThought.author?.subdomain || "utilisateur"}
                    </span>
                  </ProfileHoverCard>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyToThought(null)}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Annuler la réponse"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-foreground/90 leading-relaxed font-sans line-clamp-3">
                {replyToThought.content}
              </p>

              <div className="text-[11px] text-muted-foreground pt-1">
                En réponse à{" "}
                <ProfileHoverCard user={replyToThought.author}>
                  <span className="text-brand font-medium hover:underline cursor-pointer">
                    @{replyToThought.author?.username || replyToThought.author?.subdomain || "utilisateur"}
                  </span>
                </ProfileHoverCard>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Composer Row */}
      <form onSubmit={(e) => handlePostSubmit(e)} className="space-y-3 font-sans">
        <div className="flex gap-3 items-start">
          {/* User Avatar */}
          <AuthorAvatar
            user={dbUser}
            size="md"
            showBadge={false}
          />

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              placeholder={defaultPlaceholder}
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
            if (mentionSuggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setMentionSelectedIndex((prev) => (prev + 1) % mentionSuggestions.length)
                return
              }
              if (e.key === "ArrowUp") {
                e.preventDefault()
                setMentionSelectedIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length)
                return
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                insertMention(mentionSuggestions[mentionSelectedIndex])
                return
              }
              if (e.key === "Escape") {
                e.preventDefault()
                setMentionSuggestions([])
                setMentionQuery(null)
                return
              }
            }

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
              setMentionSuggestions([])
              setMentionQuery(null)
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

        {/* Universal Typeahead Suggestions Dropdown */}
        {mentionSuggestions.length > 0 && (
          <div className="relative font-sans z-[100]">
            <div className="absolute top-1 left-0 w-72 max-h-56 overflow-y-auto bg-popover text-popover-foreground border border-border/80 rounded-xl shadow-2xl p-1 font-sans animate-in fade-in-0 zoom-in-95 duration-100">
              {mentionSuggestions.map((item, idx) => {
                const isSelected = idx === mentionSelectedIndex
                return (
                  <div
                    key={item.id || idx}
                    onClick={() => insertMention(item)}
                    className={cn(
                      "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs select-none",
                      isSelected
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item._type === "profile" && (
                      <>
                        <AuthorAvatar user={item} size="xs" showBadge={false} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="font-bold truncate text-foreground">{item.name || "Auteur"}</span>
                            {item.isCertified && <CertifiedBadge />}
                          </div>
                          <span className="text-[11px] truncate text-muted-foreground">@{item.username || item.subdomain}</span>
                        </div>
                      </>
                    )}
                    {item._type === "tag" && (
                      <div className="flex items-center gap-2 font-medium">
                        <span className="font-bold text-primary">#</span>
                        <span className="text-foreground">{item.value}</span>
                      </div>
                    )}
                    {item._type === "emoji" && (
                      <div className="flex items-center gap-2 font-medium">
                        <span className="text-base">{item.char}</span>
                        <span className="text-muted-foreground text-xs">{item.name}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {quotedThought && (
          <div className="relative my-2">
            <button
              type="button"
              onClick={() => setQuotedThought(null)}
              className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-neutral-900/80 text-white hover:bg-neutral-900 transition-colors cursor-pointer"
              title="Retirer la citation"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <QuotedThoughtCard post={quotedThought} />
          </div>
        )}

        {quotedArticle && (
          <div className="relative my-2">
            <button
              type="button"
              onClick={() => {
                setQuotedArticle(null)
                setQuotedExcerpt(null)
              }}
              className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-neutral-900/80 text-white hover:bg-neutral-900 transition-colors cursor-pointer shadow-md"
              title="Retirer la citation"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <QuotedArticleCard article={quotedArticle} quotedExcerpt={quotedExcerpt || undefined} />
          </div>
        )}

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
                <div className="bg-destructive/10 text-destructive text-[11px] font-semibold p-3 rounded-lg flex items-center gap-2 border border-destructive/20">
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
                        className="relative aspect-video bg-muted/40 border border-border/40 group overflow-hidden rounded-xl"
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

                             {/* ALT, Crop & Replace actions */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const newAlt = prompt("Saisissez la description Alt-Text d'accessibilité pour cette image :", img.altText || "")
                                  if (newAlt !== null) {
                                    setImages(prev => prev.map(i => i.id === img.id ? { ...i, altText: newAlt.trim() } : i))
                                  }
                                }}
                                className={cn(
                                  "px-2 py-1 rounded-[var(--radius-button)] text-[11px] font-bold cursor-pointer transition-colors border",
                                  img.altText
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-black/60 hover:bg-black/85 text-white border-white/20"
                                )}
                                title={img.altText ? `Alt-text: ${img.altText}` : "Ajouter un texte d'accessibilité"}
                              >
                                ALT
                              </button>
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
                              onClick={() => {
                                if (img.url.startsWith("blob:")) {
                                  URL.revokeObjectURL(img.url)
                                }
                                setImages(prev => prev.filter(i => i.id !== img.id))
                              }}
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

              {/* Poll Editor Panel */}
              {showPollEditor && (
                <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-3 font-sans my-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <BarChart2 className="w-4 h-4" />
                      Créer un sondage
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPollEditor(false)
                        setPollOptions(["", ""])
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                      title="Retirer le sondage"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const updated = [...pollOptions]
                            updated[idx] = e.target.value
                            setPollOptions(updated)
                          }}
                          maxLength={80}
                          className="flex-1 bg-background/80 border border-border/60 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            title="Supprimer cette option"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    {pollOptions.length < 4 ? (
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ""])}
                        className="text-primary font-semibold hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        + Ajouter une option
                      </button>
                    ) : <span />}

                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <span>Durée :</span>
                      <select
                        value={pollDurationHours}
                        onChange={(e) => setPollDurationHours(Number(e.target.value))}
                        className="bg-background border border-border/60 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value={1}>1 heure</option>
                        <option value={6}>6 heures</option>
                        <option value={24}>1 jour</option>
                        <option value={72}>3 jours</option>
                        <option value={168}>7 jours</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

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

                  {/* Poll Toggle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowPollEditor(!showPollEditor)
                      if (!showPollEditor && pollOptions.length < 2) {
                        setPollOptions(["", ""])
                      }
                    }}
                    className={cn(
                      "p-2 rounded-[var(--radius-button)] border transition-all cursor-pointer flex items-center justify-center text-xs",
                      showPollEditor
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    )}
                    title="Ajouter un sondage"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                  </button>


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

                  {/* 1b. Restriction des réponses Dropdown (Threadgate) */}
                  <Popover open={showReplyRestrictionDropdown} onOpenChange={setShowReplyRestrictionDropdown}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className={cn(
                            "p-2 rounded-[var(--radius-button)] border transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs text-[var(--text-secondary)]",
                            replyRestriction !== "everyone"
                              ? "bg-[var(--surface-2)] border-[var(--border-default)] text-[var(--text-primary)]"
                              : "border-transparent bg-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                          )}
                          title="Qui peut répondre"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>
                            {replyRestriction === "everyone" && "Réponses libres"}
                            {replyRestriction === "subscribers" && "Abonnés"}
                            {replyRestriction === "following" && "Suivis"}
                            {replyRestriction === "mentioned" && "Mentionnés"}
                          </span>
                        </button>
                      }
                    />
                    <PopoverContent align="start" className="w-56 p-1.5 space-y-0.5 bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-button)] shadow-lg z-50">
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Qui peut répondre ?
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyRestriction("everyone")
                          setShowReplyRestrictionDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors flex items-center gap-2",
                          replyRestriction === "everyone" ? "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium" : "hover:bg-[var(--surface-1)] text-[var(--text-secondary)]"
                        )}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Tout le monde</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyRestriction("subscribers")
                          setShowReplyRestrictionDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors flex items-center gap-2",
                          replyRestriction === "subscribers" ? "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium" : "hover:bg-[var(--surface-1)] text-[var(--text-secondary)]"
                        )}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Abonnés uniquement</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyRestriction("following")
                          setShowReplyRestrictionDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors flex items-center gap-2",
                          replyRestriction === "following" ? "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium" : "hover:bg-[var(--surface-1)] text-[var(--text-secondary)]"
                        )}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Personnes suivies</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyRestriction("mentioned")
                          setShowReplyRestrictionDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs transition-colors flex items-center gap-2",
                          replyRestriction === "mentioned" ? "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium" : "hover:bg-[var(--surface-1)] text-[var(--text-secondary)]"
                        )}
                      >
                        <AtSign className="w-3.5 h-3.5" />
                        <span>Personnes mentionnées</span>
                      </button>
                    </PopoverContent>
                  </Popover>

                  {/* 2. Planification Dropdown (Shadcn Popover & Calendar) */}
                  <Popover open={showScheduleDropdown} onOpenChange={(open: boolean) => {
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
                          onSelect={(dateVal: Date | undefined) => {
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
                    className="bg-[var(--qoe-vermillion,#EE4B2B)] text-white hover:bg-[#d63d20] disabled:bg-muted disabled:text-muted-foreground transition-all duration-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer outline-none shadow-sm"
                    style={{ boxShadow: "0 2px 8px var(--qoe-vermillion-glow)" }}
                  >
                    {isSubmitting ? (
                      <>
                        Envoi... <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </>
                    ) : (
                      <>
                        {replyToThought || parentId ? "Répondre" : "Publier"} <Send className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
          </div>
        </div>
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
