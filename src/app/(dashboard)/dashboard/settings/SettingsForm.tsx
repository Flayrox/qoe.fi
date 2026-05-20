"use client"

import { useState } from "react"
import { useTolgee } from "@tolgee/react"
import { updateMediaConfig } from "./actions"
import { Loader2 } from "lucide-react"

export function SettingsForm({ user }: { user: any }) {
  const { t } = useTolgee()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await updateMediaConfig(formData)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm">
          Settings saved successfully!
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Subdomain (.qoe.fi)</label>
          <input
            type="text"
            name="subdomain"
            defaultValue={user?.subdomain || ""}
            placeholder="my-awesome-media"
            className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Custom Domain</label>
          <input
            type="text"
            name="customDomain"
            defaultValue={user?.customDomain || ""}
            placeholder="www.mymedia.com"
            className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Layout Style</label>
          <select 
            name="layoutStyle" 
            defaultValue={user?.layoutStyle || "minimal"}
            className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="minimal">Minimal (Default)</option>
            <option value="magazine">Magazine</option>
            <option value="brutalist">Brutalist</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Theme Mode</label>
          <select 
            name="themeMode" 
            defaultValue={user?.themeMode || "system"}
            className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="system">System (Auto)</option>
            <option value="light">Always Light</option>
            <option value="dark">Always Dark</option>
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Accent Color (Hex)</label>
          <div className="flex gap-2">
            <input
              type="color"
              name="accentColor"
              defaultValue={user?.accentColor || "#ef4444"}
              className="h-11 w-16 p-1 bg-secondary/30 border border-border rounded-lg cursor-pointer"
            />
            <input
              type="text"
              defaultValue={user?.accentColor || "#ef4444"}
              className="flex-1 bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Hero Text</label>
          <input
            type="text"
            name="heroText"
            defaultValue={user?.heroText || ""}
            placeholder="Welcome to my sanctuary of thoughts"
            className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-semibold mb-4">SEO & Search</h4>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">SEO Title</label>
            <input
              type="text"
              name="seoTitle"
              defaultValue={user?.seoTitle || ""}
              placeholder="My Media | Independent Journalism"
              className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">SEO Description</label>
            <textarea
              name="seoDescription"
              defaultValue={user?.seoDescription || ""}
              placeholder="Short description for Google and Twitter cards..."
              rows={2}
              className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button 
          type="submit" 
          disabled={isSaving}
          className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  )
}
