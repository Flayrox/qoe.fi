# Vision Rauno Freiberg : Ingénierie du Design Sensationnel

## Philosophie et Logique Mathématique

Le design "IA" actuel (grosses coques Bento rouges, rayons extrêmes de 40px, contrastes violents) crée une interface lourde et générique. Pour adopter l'approche de Rauno Freiberg (ingénieur design chez Vercel), nous devons passer à une **UI spatiale, éthérée et hyper-tactile**. 

L'obsession de Rauno se traduit par :
1.  **L'invisibilité jusqu'à l'interaction** : Les bordures ne sont pas pleines, elles sont de `1px` avec une opacité de 4% à 8%. Les fonds sont translucides (`backdrop-blur`).
2.  **La physique des ressorts (Springs)** : Aucune transition CSS basique. Nous utilisons Framer Motion avec des valeurs mathématiques imitant la réalité. 
    *   *Snappy* : `stiffness: 500, damping: 40, mass: 0.8` (Pour les hovers, sensation de retour haptique immédiat).
    *   *Fluid Layout* : `stiffness: 250, damping: 25` (Pour le déplacement des indicateurs actifs `layoutId`).
3.  **Typographie Chirurgicale** : Le tracking (espacement des lettres) est ajusté. Les titres sont resserrés (`tracking-tight`), les sur-titres sont aérés (`tracking-widest`).

## 1. La Nouvelle `AppSidebar.tsx`

**Vision** : La sidebar n'est plus une "boîte dans une boîte". C'est une colonne transparente qui fusionne avec le fond. L'élément actif utilise un "Sliding Pill" (un fond qui glisse d'un lien à l'autre sans interruption).

```tsx
"use client"

import React, { useState } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Activity, BookMarked, Highlighter, Wallet, Settings, User, LogOut, LayoutDashboard
} from "lucide-react"
import { cn } from "@/lib/utils"

// Rauno's signature physics
const springs = {
  layout: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 },
  hover: { type: "spring", stiffness: 500, damping: 40 }
}

export function AppSidebar({ user }: { user: any }) {
  const pathname = usePathname()
  const [hoveredIndex, setHoveredIndex] = useState<string | null>(null)

  const navLinks = [
    { href: "/home", label: "Timeline", icon: Activity },
    { href: "/library", label: "Mes Signets", icon: BookMarked },
    { href: "/highlights", label: "Surlignages", icon: Highlighter },
    { href: "/billing", label: "Portefeuille", icon: Wallet },
  ]

  return (
    <aside className="lg:col-span-3 lg:sticky lg:top-0 h-screen py-8 hidden lg:flex flex-col border-r border-black/[0.04]">
      {/* Logo Sensationnel */}
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="relative flex items-center justify-center w-6 h-6">
          <div className="absolute inset-0 bg-[#EE4B2B] rounded-[6px] rotate-3 opacity-20" />
          <div className="relative w-full h-full bg-[#EE4B2B] rounded-[6px] flex items-center justify-center shadow-[0_2px_8px_rgba(238,75,43,0.3)]">
            <span className="text-white text-[10px] font-black tracking-tighter">Q</span>
          </div>
        </div>
        <span className="text-sm font-semibold text-neutral-900 tracking-tight">QOE.FI</span>
      </div>

      {/* Navigation Hyper-Fluide */}
      <nav className="flex-1 px-4 space-y-0.5 relative" onMouseLeave={() => setHoveredIndex(null)}>
        {navLinks.map((link) => {
          const isActive = pathname === link.href
          const isHovered = hoveredIndex === link.href
          const Icon = link.icon

          return (
            <a
              key={link.href}
              href={link.href}
              onMouseEnter={() => setHoveredIndex(link.href)}
              className="relative flex items-center gap-3 px-3 py-2 text-sm transition-colors z-10 outline-none focus-visible:ring-2 focus-visible:ring-black/5 rounded-xl"
            >
              {/* Le Pill actif statique */}
              {isActive && !isHovered && (
                <motion.div
                  layoutId="activePill"
                  transition={springs.layout}
                  className="absolute inset-0 bg-black/[0.03] rounded-xl -z-10"
                />
              )}
              
              {/* Le Hover Pill dynamique */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    layoutId="hoverPill"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={springs.layout}
                    className="absolute inset-0 bg-black/[0.02] rounded-xl -z-10"
                  />
                )}
              </AnimatePresence>

              <Icon className={cn(
                "w-4 h-4 shrink-0 transition-all duration-300",
                isActive ? "text-neutral-900 drop-shadow-[0_0_8px_rgba(0,0,0,0.1)]" : "text-neutral-400 group-hover:text-neutral-600"
              )} />
              <span className={cn(
                "font-medium transition-colors duration-300",
                isActive ? "text-neutral-900" : "text-neutral-500"
              )}>
                {link.label}
              </span>
            </a>
          )
        })}
      </nav>

      {/* Footer Profil minimaliste */}
      <div className="px-4 mt-auto">
        <button className="w-full relative flex items-center gap-3 p-2 rounded-2xl hover:bg-black/[0.02] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-black/5 group">
          <div className="w-8 h-8 rounded-full overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-black/5">
            {user?.logoUrl ? <img src={user.logoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-neutral-100" />}
          </div>
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-xs font-semibold text-neutral-900 truncate w-full leading-none mb-1">{user?.name || "Lecteur"}</span>
            <span className="text-[10px] text-neutral-400 font-mono truncate w-full leading-none">
              {(user?.walletBalanceCents / 100).toFixed(2)} €
            </span>
          </div>
          <Settings className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-900 transition-colors" />
        </button>
      </div>
    </aside>
  )
}
```

## 2. Le Nouveau `FeedDashboard.tsx`

**Vision** : Fini le gigantesque bloc rouge `#EE4B2B`. L'arrière-plan de l'application est un blanc cassé texturé (`#FCFCFC`). Le "Segmented Control" pour choisir le flux flotte en haut de l'écran avec un effet *glassmorphism* fort pour que les articles passent *en dessous* lors du défilement (effet de flou dynamique).

```tsx
"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

const springs = {
  tab: { type: "spring", stiffness: 400, damping: 30, mass: 0.8 },
  card: { type: "spring", stiffness: 300, damping: 25 }
}

export function FeedDashboard({ articles }: { articles: any[] }) {
  const [activeTab, setActiveTab] = useState("recommandation")
  const tabs = ["recommandation", "abonnement", "decouvrir"]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 max-w-5xl mx-auto py-8">
      
      {/* Colonne Feed Centrale */}
      <div className="lg:col-span-8 relative">
        
        {/* Rauno's Segmented Control (Sticky + Blur) */}
        <div className="sticky top-6 z-50 flex justify-center mb-10 pointer-events-none">
          <div className="pointer-events-auto flex items-center p-1 bg-white/60 backdrop-blur-xl border border-black/[0.04] shadow-[0_8px_32px_rgba(0,0,0,0.04)] rounded-full">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="relative px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-900 transition-colors rounded-full outline-none"
              >
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeFeedTab"
                    transition={springs.tab}
                    className="absolute inset-0 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.02]"
                  />
                )}
                <span className="relative z-10">{tab}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Liste des articles avec espacement aéré */}
        <div className="space-y-12">
          {articles.map((article, idx) => (
            <motion.article
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.card, delay: idx * 0.05 }}
              className="group cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 rounded-full bg-black/5" />
                <span className="text-[11px] font-medium text-neutral-600">{article.author.name}</span>
                <span className="w-0.5 h-0.5 rounded-full bg-neutral-300" />
                <span className="text-[11px] text-neutral-400 font-mono">il y a 2h</span>
              </div>
              
              <h3 className="text-xl font-bold text-neutral-900 tracking-tight leading-snug mb-2 group-hover:text-[#EE4B2B] transition-colors">
                {article.title}
              </h3>
              
              <p className="text-sm text-neutral-500 leading-relaxed max-w-2xl line-clamp-3">
                {article.content}
              </p>
            </motion.article>
          ))}
        </div>
      </div>

      {/* Widgets Minimalistes */}
      <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-10">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">Actualités</h4>
          <ul className="space-y-4">
            <li className="group cursor-pointer">
              <span className="text-[10px] text-neutral-400 font-mono block mb-1">Aujourd'hui</span>
              <span className="text-xs font-semibold text-neutral-800 group-hover:text-[#EE4B2B] transition-colors block">Calibrage vectoriel de la timeline</span>
            </li>
          </ul>
        </div>
      </div>

    </div>
  )
}
```

## Le Rendu Visuel Final (Mental Model)
La page ne ressemble plus à un tableau de bord SaaS lourd. Elle ressemble à **l'application web d'une galerie d'art moderne ou à l'interface propre de Linear/Vercel**. 
*   Le rouge `#EE4B2B` n'est plus une agression visuelle qui remplit des divs massives, c'est un point d'attention sélectif (un hover sur un titre, la lueur microscopique sous le logo). 
*   Le *Segmented Control* flottant qui devient flou (`backdrop-blur-xl`) lorsque les articles glissent en dessous procure un sentiment d'espace tridimensionnel ("Layering").
*   La Sidebar n'a pas de fond distinct de la page. C'est simplement une démarcation structurelle avec un séparateur si subtil (`border-black/[0.04]`) qu'on le perçoit plus qu'on ne le voit. 

Tout ceci crée une signature réellement "Premium", à l'opposé du design "générique" précédent.
