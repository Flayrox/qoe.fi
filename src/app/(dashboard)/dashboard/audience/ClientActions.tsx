"use client"

import { useState } from "react"
import { Mail, ShieldBan, Loader2 } from "lucide-react"
import { blockReader } from "./actions/block"

export function ClientActions({ email }: { email: string }) {
  const [isBlocking, setIsBlocking] = useState(false)

  const handleBlock = async () => {
    if (confirm(`Are you sure you want to block ${email}? They will no longer be able to subscribe or read premium content.`)) {
      setIsBlocking(true)
      try {
        await blockReader(email)
        alert(`${email} has been blocked.`)
      } catch (e: any) {
        alert(e.message)
      } finally {
        setIsBlocking(false)
      }
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button className="p-2 hover:bg-muted rounded-md transition-colors" title="Send email">
        <Mail className="w-4 h-4 text-muted-foreground" />
      </button>
      <button 
        onClick={handleBlock}
        disabled={isBlocking}
        className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors disabled:opacity-50" 
        title="Revoke access & Block"
      >
        {isBlocking ? <Loader2 className="w-4 h-4 text-destructive animate-spin" /> : <ShieldBan className="w-4 h-4 text-muted-foreground" />}
      </button>
    </div>
  )
}
