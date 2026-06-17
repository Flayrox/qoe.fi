"use client"

import React, { useState, useRef, useEffect } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Image from "@tiptap/extension-image"
import { PaywallDivider } from "../extensions/PaywallDivider"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  ArrowLeft,
  ImageIcon,
  Loader2,
  Check,
  Globe,
  Lock,
  Unlock,
  Settings,
  FolderOpen,
  Search,
  Eye,
  CornerDownRight
} from "lucide-react"
import { cn } from "@qoe/utils"

export interface EditorProps {
  initialTitle?: string
  initialSlug?: string
  initialContent?: string
  initialPublished?: boolean
  initialIsPremium?: boolean
  initialCategoryId?: string | null
  initialSeoTitle?: string | null
  initialSeoDescription?: string | null
  categories?: { id: string; name: string }[]
  isSaving?: boolean
  onSave: (data: {
    title: string
    content: string
    slug: string
    published: boolean
    isPremium: boolean
    categoryId: string | null
    seoTitle: string | null
    seoDescription: string | null
  }) => Promise<void>
  onBack?: () => void
}

export function Editor({
  initialTitle = "",
  initialSlug = "",
  initialContent = "",
  initialPublished = false,
  initialIsPremium = false,
  initialCategoryId = null,
  initialSeoTitle = "",
  initialSeoDescription = "",
  categories = [],
  isSaving = false,
  onSave,
  onBack,
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [slug, setSlug] = useState(initialSlug)
  const [published, setPublished] = useState(initialPublished)
  const [isPremium, setIsPremium] = useState(initialIsPremium)
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId)
  const [seoTitle, setSeoTitle] = useState(initialSeoTitle || "")
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription || "")
  
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  const [showSettings, setShowSettings] = useState(false)
  const [editorTick, setEditorTick] = useState(0)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [ /* @ts-ignore */
      StarterKit, 
      Underline,
      PaywallDivider,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-2xl border border-zinc-150 my-10 max-w-full h-auto shadow-sm',
        },
      })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-zinc max-w-none focus:outline-none min-h-[500px] text-zinc-800 text-[17px] font-classical leading-relaxed placeholder:text-zinc-300",
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          uploadImage(file);
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      setHasUnsavedChanges(true)
      setEditorTick(prev => prev + 1)
    }
  })

  // Watch for state changes to mark as unsaved
  useEffect(() => {
    if (title !== initialTitle || slug !== initialSlug || categoryId !== initialCategoryId || seoTitle !== (initialSeoTitle || "") || seoDescription !== (initialSeoDescription || "")) {
      setHasUnsavedChanges(true)
    }
  }, [title, slug, categoryId, seoTitle, seoDescription])

  // Generate slug automatically
  useEffect(() => {
    if (!initialSlug && title && !slug) {
      const generated = title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")
      setSlug(generated)
    }
  }, [title, initialSlug, slug])

  const uploadImage = async (file: File) => {
    if (!editor) return;
    
    if (!file.type.startsWith("image/")) {
      setError("Le fichier doit être une image valide.");
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/articles/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Échec de l'upload");
      }

      editor.chain().focus().setImage({ src: data.url }).run();
      setHasUnsavedChanges(true)
    } catch (err: any) {
      setError(err?.message || "Une erreur est survenue lors de l'upload de l'image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleManualSave = async () => {
    if (!title.trim()) {
      setError("Le titre de l'article est requis avant d'enregistrer.")
      return
    }
    
    try {
      setError(null)
      const htmlContent = editor?.getHTML() || ""
      let finalSlug = slug;
      if (!finalSlug) {
        finalSlug = title
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "")
        setSlug(finalSlug);
      }

      await onSave({
        title,
        content: htmlContent,
        slug: finalSlug,
        published,
        isPremium,
        categoryId,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null
      })
      setLastSaved(new Date())
      setHasUnsavedChanges(false)
    } catch (err: any) {
      setError(err?.message || "Échec de la sauvegarde.")
    }
  }

  // Keyboard shortcut for saving (Cmd+S / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        handleManualSave()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [title, slug, published, isPremium, categoryId, seoTitle, seoDescription, editor])

  // Debounced auto-save (saves 1.5s after user stops typing)
  useEffect(() => {
    if (!hasUnsavedChanges || isSaving || !title.trim()) return

    const timer = setTimeout(() => {
      handleManualSave()
    }, 1500)

    return () => clearTimeout(timer)
  }, [
    title,
    slug,
    published,
    isPremium,
    categoryId,
    seoTitle,
    seoDescription,
    editorTick,
    hasUnsavedChanges,
    isSaving
  ])

  if (!editor) {
    return null
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-12 pb-32">
      {/* Sleek, spaced header with absolute minimal decorations */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-zinc-100">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="h-8 w-8 rounded-full flex items-center justify-center border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 transition-all cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-medium text-zinc-900 font-sans tracking-tight flex items-center gap-3">
              {initialTitle ? "Édition" : "Nouvel écrit"}
              {isSaving && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
              {lastSaved && !isSaving && (
                <span className="text-[11px] font-normal text-zinc-400 flex items-center gap-1.5 font-sans">
                  <Check className="w-3.5 h-3.5 text-zinc-400" /> Sauvegardé à {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {hasUnsavedChanges && !isSaving && (
                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-md font-sans">
                  Modifications non enregistrées (Cmd+S)
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Rédigez sans bruit ni distraction
            </p>
          </div>
        </div>

        {/* Action Controls - minimal layout, no borders on buttons where possible */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Options Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border border-zinc-200",
              showSettings
                ? "bg-zinc-100 text-zinc-900"
                : "bg-white text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Options</span>
          </button>

          {/* Premium / Free */}
          <button
            onClick={() => {
              setIsPremium(!isPremium);
              setHasUnsavedChanges(true)
            }}
            className={cn(
              "h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border",
              isPremium
                ? "bg-zinc-900 border-zinc-900 text-white hover:bg-zinc-800"
                : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
            )}
          >
            {isPremium ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            <span>{isPremium ? "Premium" : "Gratuit"}</span>
          </button>

          {/* Published / Draft */}
          <button
            onClick={() => {
              setPublished(!published);
              setHasUnsavedChanges(true)
            }}
            className={cn(
              "h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border",
              published
                ? "bg-zinc-900 border-zinc-900 text-white hover:bg-zinc-800"
                : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
            )}
          >
            {published ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            <span>{published ? "Publié" : "Brouillon"}</span>
          </button>

          {/* Save Action */}
          <button
            onClick={handleManualSave}
            disabled={isSaving}
            className="h-8 px-4 bg-primary text-white font-sans text-xs font-semibold rounded-lg flex items-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-sm"
          >
            <span>Enregistrer</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200/60 text-red-700 p-4 font-sans text-xs rounded-xl">
          {error}
        </div>
      )}

      {/* Main Content Area - Wide spaces, Rauno-style */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
        {/* Editor column */}
        <div className={cn("transition-all space-y-12", showSettings ? "lg:col-span-2" : "lg:col-span-3")}>
          {/* Title Area - completely borderless, large and elegant typography */}
          <div className="space-y-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de votre œuvre..."
              className="w-full bg-transparent border-0 text-3xl font-bold tracking-tight text-zinc-900 focus:outline-none focus:ring-0 placeholder:text-zinc-200 font-sans leading-tight"
            />
            
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
              <span>slug :</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))}
                placeholder="slug-url"
                className="bg-transparent border-0 p-0 text-xs font-mono text-zinc-500 focus:outline-none focus:ring-0 w-full"
              />
            </div>
          </div>

          {/* Text Editor Core */}
          <div className="space-y-6">
            {/* Ultra minimal formatting toolbar, pure light theme, no borders between buttons */}
            <div className="flex flex-wrap items-center gap-0.5 py-1.5 border-b border-zinc-100 sticky top-0 bg-white/80 backdrop-blur-md z-10">
              <ToolbarButton
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                icon={<Bold className="h-3.5 w-3.5" />}
                tooltip="Gras"
              />
              <ToolbarButton
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                icon={<Italic className="h-3.5 w-3.5" />}
                tooltip="Italique"
              />
              <ToolbarButton
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                icon={<UnderlineIcon className="h-3.5 w-3.5" />}
                tooltip="Souligné"
              />
              <ToolbarButton
                active={editor.isActive("strike")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                icon={<Strikethrough className="h-3.5 w-3.5" />}
                tooltip="Barré"
              />

              <div className="h-4 w-[1px] bg-zinc-200 mx-2" />

              <ToolbarButton
                active={editor.isActive("heading", { level: 1 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                icon={<Heading1 className="h-3.5 w-3.5" />}
                tooltip="Titre 1"
              />
              <ToolbarButton
                active={editor.isActive("heading", { level: 2 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                icon={<Heading2 className="h-3.5 w-3.5" />}
                tooltip="Titre 2"
              />
              <ToolbarButton
                active={editor.isActive("heading", { level: 3 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                icon={<Heading3 className="h-3.5 w-3.5" />}
                tooltip="Titre 3"
              />

              <div className="h-4 w-[1px] bg-zinc-200 mx-2" />

              <ToolbarButton
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                icon={<List className="h-3.5 w-3.5" />}
                tooltip="Liste puces"
              />
              <ToolbarButton
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                icon={<ListOrdered className="h-3.5 w-3.5" />}
                tooltip="Liste numéros"
              />

              <div className="h-4 w-[1px] bg-zinc-200 mx-2" />

              <ToolbarButton
                active={editor.isActive("blockquote")}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                icon={<Quote className="h-3.5 w-3.5" />}
                tooltip="Citation"
              />
              <ToolbarButton
                active={editor.isActive("codeBlock")}
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                icon={<Code className="h-3.5 w-3.5" />}
                tooltip="Code"
              />

              <div className="h-4 w-[1px] bg-zinc-200 mx-2" />

              {/* Media selection */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="image/*" 
                className="hidden" 
                aria-label="Insérer image"
              />
              <ToolbarButton
                onClick={() => fileInputRef.current?.click()}
                icon={isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" /> : <ImageIcon className="h-3.5 w-3.5" />}
                tooltip="Image"
                disabled={isUploading}
              />
            </div>

            {/* TipTap main body with classical light font */}
            <div className="py-4">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {/* Options / Settings Panel - Clean, Spacious, pure white */}
        {showSettings && (
          <div className="space-y-12 lg:col-span-1 animate-in fade-in-50 duration-200 lg:sticky lg:top-24">
            {/* Category selection */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-sans flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
                Catégorie
              </h3>
              
              <div className="space-y-3">
                <select
                  value={categoryId || ""}
                  onChange={(e) => {
                    setCategoryId(e.target.value || null);
                  }}
                  className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs text-zinc-700 focus:outline-none focus:border-zinc-400 transition-colors font-sans cursor-pointer"
                >
                  <option value="">-- Sans catégorie --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Associez cet écrit à un thème pour l'organiser sur votre blog.
                </p>
              </div>
            </div>

            {/* SEO Optimization */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-sans flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                Optimisation SEO
              </h3>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-sans uppercase tracking-wider font-semibold">
                    Titre alternatif
                  </label>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    placeholder={title || "Titre d'origine"}
                    className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs text-zinc-700 focus:outline-none focus:border-zinc-400 transition-colors font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-sans uppercase tracking-wider font-semibold">
                    Description SEO
                  </label>
                  <textarea
                    rows={3}
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    placeholder="Une courte accroche pour les moteurs de recherche..."
                    className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs text-zinc-700 focus:outline-none focus:border-zinc-400 transition-colors font-sans resize-none"
                  />
                </div>

                {/* Google Preview - clean simulated search result */}
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1 font-sans">
                  <span className="text-[9px] text-zinc-400 font-mono block">Aperçu Google</span>
                  <span className="text-xs font-medium text-zinc-900 block truncate">
                    {seoTitle || title || "Titre de l'écrit"}
                  </span>
                  <span className="text-[10px] text-zinc-400 block line-clamp-2 leading-relaxed">
                    {seoDescription || "Aucune description SEO saisie. Google utilisera le début de votre article."}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  active?: boolean
  onClick: () => void
  icon: React.ReactNode
  tooltip: string
  disabled?: boolean
}

function ToolbarButton({ active, onClick, icon, tooltip, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      disabled={disabled}
      className={cn(
        "h-8 w-8 flex items-center justify-center rounded-lg transition-all font-sans text-sm cursor-pointer",
        active
          ? "bg-zinc-900 text-white font-medium"
          : "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {icon}
    </button>
  )
}
