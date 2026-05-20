"use client"

import { useState } from "react"
import { subscribeToNewsletter } from "@/app/tenant/[domain]/actions/subscribe"
import { Loader2 } from "lucide-react"

interface SubscribeFormProps {
  creatorId: string
  isBrutalist?: boolean
}

export function SubscribeForm({ creatorId, isBrutalist }: SubscribeFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  async function handleSubmit(formData: FormData) {
    setStatus("loading")
    setMessage("")
    
    const result = await subscribeToNewsletter(formData)
    
    if (result.error) {
      setStatus("error")
      setMessage(result.error)
    } else {
      setStatus("success")
      setMessage("Thank you for subscribing! Check your inbox soon.")
    }
  }

  if (status === "success") {
    return (
      <div className={`p-6 max-w-md mx-auto text-center ${isBrutalist ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-background' : 'bg-green-500/10 rounded-xl'}`}>
        <h4 className="text-lg font-bold text-green-600 dark:text-green-400 mb-2">You&apos;re on the list!</h4>
        <p className="text-muted-foreground">{message}</p>
        <button 
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm font-medium text-[var(--tenant-accent)] hover:underline"
        >
          Subscribe another email
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form action={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input type="hidden" name="creatorId" value={creatorId} />
        <input 
          type="email" 
          name="email"
          required
          placeholder="Your email address" 
          className={`flex-1 h-14 px-5 text-lg ${isBrutalist ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] bg-background text-foreground placeholder:text-muted-foreground' : 'rounded-xl border border-input bg-background focus:ring-2 focus:ring-[var(--tenant-accent)] focus:border-transparent outline-none transition-all'}`}
        />
        <button 
          type="submit"
          disabled={status === "loading"}
          className={`h-14 px-8 font-semibold text-white text-lg transition-all flex items-center justify-center gap-2 ${isBrutalist ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:translate-y-1 hover:shadow-none disabled:opacity-50' : 'rounded-xl hover:opacity-90 active:scale-95 disabled:opacity-50'}`}
          style={{ backgroundColor: 'var(--tenant-accent)' }}
        >
          {status === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : "Subscribe"}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-3 text-red-500 text-sm font-medium">{message}</p>
      )}
    </div>
  )
}
