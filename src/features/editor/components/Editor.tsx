"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Image from "@tiptap/extension-image"
import { PaywallDivider } from "../extensions/PaywallDivider"
import { useDebounce } from "use-debounce"
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
  Undo2,
  Redo2,
  Save,
  Globe,
  Lock,
  ArrowLeft,
  ImageIcon,
  Loader2,
  Check,
  Send,
  Unlock
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface EditorProps {
  initialTitle?: string
  initialSlug?: string
  initialContent?: string
  initialPublished?: boolean
  initialIsPremium?: boolean
  isSaving?: boolean
  onSave: (data: {
    title: string
    content: string
    slug: string
    published: boolean
    isPremium: boolean
  }) => Promise<void>
  onBack?: () => void
}

export function Editor({
  initialTitle = "",
  initialSlug = "",
  initialContent = "",
  initialPublished = false,
  initialIsPremium = false,
  isSaving = false,
  onSave,
  onBack,
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [slug, setSlug] = useState(initialSlug)
  const [published, setPublished] = useState(initialPublished)
  const [isPremium, setIsPremium] = useState(initialIsPremium)
  const [error, setError] = useState<string | null>(null)
  
  const [isUploading, setIsUploading] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isFirstRender = useRef(true)

  const [debouncedTitle] = useDebounce(title, 2000)
  const [debouncedSlug] = useDebounce(slug, 2000)

  const editor = useEditor({
    extensions: [
      StarterKit, 
      Underline,
      PaywallDivider,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-xl shadow-md border border-zinc-800 my-8 max-w-full h-auto',
        },
      })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[400px] text-lg font-serif leading-relaxed placeholder:text-zinc-600",
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
  })

  useEffect(() => {
    if (!initialSlug && title && !slug) {
      const generated = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")
      setSlug(generated)
    }
  }, [title, initialSlug, slug])

  const editorContent = editor?.getHTML() || "";
  const [debouncedContent] = useDebounce(editorContent, 2000);

  const performAutoSave = useCallback(async () => {
    if (!editor || isAutoSaving || isSaving) return;

    try {
      setIsAutoSaving(true);
      setError(null);
      
      await onSave({
        title: debouncedTitle,
        content: debouncedContent,
        slug: debouncedSlug,
        published,
        isPremium 
      });
      
      setLastSaved(new Date());
    } catch (err: any) {
      console.error("Auto-save failed:", err);
    } finally {
      setIsAutoSaving(false);
    }
  }, [editor, isAutoSaving, isSaving, debouncedTitle, debouncedContent, debouncedSlug, published, isPremium, onSave]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!debouncedTitle.trim() || !debouncedSlug.trim()) {
      return;
    }

    const hasChanges = 
      debouncedTitle !== initialTitle || 
      debouncedSlug !== initialSlug || 
      debouncedContent !== initialContent;

    if (hasChanges) {
      performAutoSave();
    }
  }, [debouncedTitle, debouncedSlug, debouncedContent, initialContent, initialSlug, initialTitle, performAutoSave]);

  const uploadImage = async (file: File) => {
    if (!editor) return;
    
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file");
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
        throw new Error(data.error || "Failed to upload image");
      }

      editor.chain().focus().setImage({ src: data.url }).run();
      
    } catch (err: any) {
      setError(err?.message || "An error occurred while uploading the image");
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

  if (!editor) {
    return null
  }

  const handleManualSave = async () => {
    if (!title.trim()) {
      setError("Title is required")
      return
    }
    
    try {
      setError(null)
      const htmlContent = editor.getHTML()
      // Ensure slug is generated if missing
      let finalSlug = slug;
      if (!finalSlug) {
        finalSlug = title
          .toLowerCase()
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
      })
      setLastSaved(new Date())
    } catch (err: any) {
      setError(err?.message || "Failed to save article")
    }
  }

  const handlePublishAndEmail = async () => {
    if (!title.trim()) {
      setError("Title is required before sending")
      return
    }
    setPublished(true)
    await handleManualSave()
    alert("Newsletter dispatch will be connected to Brevo API shortly! Article saved and published.")
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="h-9 w-9 rounded-lg flex items-center justify-center border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:text-white text-zinc-400 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white font-sans flex items-center gap-2">
              {initialTitle ? "Edit Article" : "New Masterpiece"}
              {(isSaving || isAutoSaving) && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
              {lastSaved && !isSaving && !isAutoSaving && (
                <span className="text-[10px] font-normal text-zinc-500 flex items-center gap-1">
                  <Check className="w-3 h-3 text-green-500" /> Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-400 font-sans">
              Drafting a new sovereign voice
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Premium Toggle */}
          <button
            onClick={() => {
              setIsPremium(!isPremium);
              setTimeout(handleManualSave, 100); 
            }}
            className={cn(
              "h-9 px-3 rounded-lg flex items-center gap-2 border border-zinc-800 font-sans text-xs font-medium transition-colors cursor-pointer",
              isPremium
                ? "bg-amber-950/30 border-amber-800/80 text-amber-400 hover:bg-amber-950/50"
                : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            )}
            title="Premium content will be hidden behind a paywall"
          >
            {isPremium ? (
              <>
                <Lock className="h-3.5 w-3.5" />
                Premium
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5" />
                Free
              </>
            )}
          </button>

          <div className="w-[1px] h-6 bg-zinc-800 mx-1"></div>

          {/* Published Toggle */}
          <button
            onClick={() => {
              setPublished(!published);
              setTimeout(handleManualSave, 100); 
            }}
            className={cn(
              "h-9 px-3 rounded-lg flex items-center gap-2 border border-zinc-800 font-sans text-xs font-medium transition-colors cursor-pointer",
              published
                ? "bg-green-950/30 border-green-800/80 text-green-400 hover:bg-green-950/50"
                : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            )}
          >
            {published ? (
              <>
                <Globe className="h-3.5 w-3.5" />
                Published
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" />
                Draft
              </>
            )}
          </button>

          {/* Send Email Newsletter */}
          <button
             onClick={handlePublishAndEmail}
             className="h-9 px-3 rounded-lg flex items-center gap-2 border border-blue-900/50 bg-blue-950/30 text-blue-400 hover:bg-blue-900/50 font-sans text-xs font-medium transition-colors cursor-pointer"
             title="Publish and email to subscribers"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dispatch</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleManualSave}
            disabled={isSaving || isAutoSaving}
            className="h-9 px-4 bg-white text-black font-sans text-xs font-semibold rounded-lg flex items-center gap-2 hover:bg-zinc-100 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {(isSaving || isAutoSaving) ? "Saving..." : "Save Changes"}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-300 p-4 font-mono text-xs rounded-lg">
          {error}
        </div>
      )}

      {/* Editor Surface */}
      <div className="grid gap-6">
        {/* Title & Slug Group */}
        <div className="space-y-4 bg-zinc-950 p-6 border border-zinc-800 rounded-xl shadow-lg">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-zinc-400 font-sans font-semibold">
              Article Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The sovereign manifestation of independent media..."
              className="w-full bg-zinc-900/30 border border-zinc-800 rounded-lg p-3 text-lg font-bold font-sans text-white focus:outline-none focus:border-zinc-700 placeholder:text-zinc-600 transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-zinc-400 font-sans font-semibold">
              Slug Identifier
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))}
              placeholder="e.g. sovereign-manifesto"
              className="w-full bg-zinc-900/10 border border-zinc-800 rounded-lg p-3 text-sm font-mono text-zinc-400 focus:outline-none focus:border-zinc-700 focus:text-white transition-colors"
            />
          </div>
        </div>

        {/* Toolbar & Text Body */}
        <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
          {/* Formatting Toolbar */}
          <div className="flex flex-wrap items-center gap-1 p-2 bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800 sticky top-0 z-10">
            {/* Inline styles */}
            <ToolbarButton
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
              icon={<Bold className="h-3.5 w-3.5" />}
              tooltip="Bold"
            />
            <ToolbarButton
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              icon={<Italic className="h-3.5 w-3.5" />}
              tooltip="Italic"
            />
            <ToolbarButton
              active={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              icon={<UnderlineIcon className="h-3.5 w-3.5" />}
              tooltip="Underline"
            />
            <ToolbarButton
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              icon={<Strikethrough className="h-3.5 w-3.5" />}
              tooltip="Strike"
            />

            <div className="h-5 w-[1px] bg-zinc-800 mx-1" />

            {/* Headers */}
            <ToolbarButton
              active={editor.isActive("heading", { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              icon={<Heading1 className="h-3.5 w-3.5" />}
              tooltip="H1"
            />
            <ToolbarButton
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              icon={<Heading2 className="h-3.5 w-3.5" />}
              tooltip="H2"
            />
            <ToolbarButton
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              icon={<Heading3 className="h-3.5 w-3.5" />}
              tooltip="H3"
            />

            <div className="h-5 w-[1px] bg-zinc-800 mx-1" />

            {/* Lists */}
            <ToolbarButton
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              icon={<List className="h-3.5 w-3.5" />}
              tooltip="Bullet List"
            />
            <ToolbarButton
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              icon={<ListOrdered className="h-3.5 w-3.5" />}
              tooltip="Ordered List"
            />

            <div className="h-5 w-[1px] bg-zinc-800 mx-1" />

            {/* Block formats */}
            <ToolbarButton
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              icon={<Quote className="h-3.5 w-3.5" />}
              tooltip="Blockquote"
            />
            <ToolbarButton
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              icon={<Code className="h-3.5 w-3.5" />}
              tooltip="Code Block"
            />

            <div className="h-5 w-[1px] bg-zinc-800 mx-1" />

            <ToolbarButton
              onClick={() => editor.chain().focus().setPaywallDivider().run()}
              icon={<Lock className="h-3.5 w-3.5 text-amber-500" />}
              tooltip="Insert Paywall Cut"
            />

            <div className="h-5 w-[1px] bg-zinc-800 mx-1" />

            {/* Media */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/*" 
              className="hidden" 
            />
            <ToolbarButton
              onClick={() => fileInputRef.current?.click()}
              icon={isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              tooltip="Insert Image"
              disabled={isUploading}
            />

            <div className="h-5 w-[1px] bg-zinc-800 mx-1" />

            {/* History */}
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              icon={<Undo2 className="h-3.5 w-3.5" />}
              tooltip="Undo"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              icon={<Redo2 className="h-3.5 w-3.5" />}
              tooltip="Redo"
            />
          </div>

          {/* Tiptap content area */}
          <div className="p-6 md:p-8 bg-zinc-950 font-serif min-h-[450px]">
            <EditorContent editor={editor} />
          </div>
        </div>
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
        "h-8 w-8 flex items-center justify-center rounded-md transition-colors font-sans text-sm cursor-pointer",
        active
          ? "bg-zinc-800 text-white font-medium"
          : "text-zinc-400 hover:text-white hover:bg-zinc-800/60",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {icon}
    </button>
  )
}
