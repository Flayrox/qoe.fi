import { NavbarPremium } from "@/components/layout/NavbarPremium"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-neutral-50 dark:bg-zinc-950 transition-colors">
      <NavbarPremium />
      <div className="pt-20">
        {children}
      </div>
    </div>
  )
}
