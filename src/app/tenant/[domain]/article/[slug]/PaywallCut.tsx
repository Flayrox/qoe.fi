"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { Lock, Wallet } from "lucide-react"

interface PaywallCutProps {
  contentHtml: string;
  isPremium: boolean;
  name: string | null;
  isBrutalist: boolean;
  accentColor: string | null;
}

export function PaywallCut({ contentHtml, isPremium, name, isBrutalist, accentColor }: PaywallCutProps) {
  // If not premium, render full content
  if (!isPremium) {
    return <div dangerouslySetInnerHTML={{ __html: contentHtml }} />;
  }

  // Find the paywall divider
  const paywallIndex = contentHtml.indexOf('<div data-type="paywall-divider"></div>');
  
  // If premium but no divider found, fallback to old behavior (cut at 30%)
  if (paywallIndex === -1) {
    const truncateIndex = Math.floor(contentHtml.length * 0.3);
    const truncatedContent = contentHtml.substring(0, truncateIndex) + '<p>...</p>';
    
    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: truncatedContent }} />
        <PaywallOverlay name={name} isBrutalist={isBrutalist} accentColor={accentColor} />
      </>
    );
  }

  // Split content at the paywall
  const freeContent = contentHtml.substring(0, paywallIndex);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: freeContent }} />
      <PaywallOverlay name={name} isBrutalist={isBrutalist} accentColor={accentColor} />
    </>
  );
}

function PaywallOverlay({ name, isBrutalist, accentColor }: { name: string|null, isBrutalist: boolean, accentColor: string|null }) {
  return (
    <div className="relative mt-8 w-full">
      <div className="absolute -top-32 left-0 w-full h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      <div className={`p-8 md:p-12 mx-auto max-w-2xl text-center not-prose relative z-10 ${isBrutalist ? 'bg-background border-4 border-foreground shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]' : 'bg-card border rounded-3xl shadow-xl'}`}>
        <div className="w-16 h-16 rounded-full bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)] flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className={`text-2xl md:text-3xl mb-4 ${isBrutalist ? 'font-black uppercase' : 'font-bold'}`}>Premium Story</h3>
        <p className="text-muted-foreground mb-8 text-lg">
          The rest of this story is exclusively for subscribers of <strong className="text-foreground">{name}</strong>.
        </p>
        
        <div className="flex flex-col gap-4 max-w-sm mx-auto">
          <button 
            className={`w-full flex items-center justify-center gap-2 py-4 font-bold text-white text-lg transition-all ${isBrutalist ? 'border-4 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:translate-y-1 hover:shadow-none' : 'rounded-xl hover:opacity-90 active:scale-95'}`}
            style={{ backgroundColor: accentColor || 'var(--primary)' }}
          >
            <Wallet className="w-5 h-5" />
            Unlock for 2,00 €
          </button>
          <Link 
            href="#subscribe" 
            className={`w-full py-3 font-semibold text-foreground bg-secondary hover:bg-secondary/80 transition-all ${isBrutalist ? 'border-4 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:translate-y-1 hover:shadow-none' : 'rounded-xl'}`}
          >
            View Subscription Plans
          </Link>
          <p className="text-sm text-muted-foreground mt-2">
            Already a subscriber? <Link href="/login" className="underline font-semibold hover:text-[var(--tenant-accent)]">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
