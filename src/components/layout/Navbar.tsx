import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export const Navbar = () => {
  return (
    <nav className="fixed top-6 left-0 right-0 z-50 px-6 pointer-events-none">
      <div className="max-w-5xl mx-auto bg-white/80 dark:bg-black/80 backdrop-blur-xl rounded-full px-8 py-4 flex justify-between items-center shadow-lg border border-white/50 dark:border-white/10 pointer-events-auto">
        <div className="flex items-center gap-12">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight text-primary">
            QOE.FI
          </Link>
          <div className="hidden md:flex gap-8 items-center">
            <Link href="#" className="text-on-surface-variant hover:text-accent transition-colors font-body text-sm font-medium">
              Platform
            </Link>
            <Link href="#" className="text-on-surface-variant hover:text-accent transition-colors font-body text-sm font-medium">
              Benefits
            </Link>
            <Link href="#" className="text-on-surface-variant hover:text-accent transition-colors font-body text-sm font-medium">
              Security
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button className="hidden md:block text-on-surface-variant font-mono text-xs tracking-widest uppercase hover:text-accent transition-colors">
            Login
          </button>
          <Button size="sm" className="rounded-full px-6 uppercase tracking-widest text-[10px] font-mono">
            Early Access
          </Button>
        </div>
      </div>
    </nav>
  );
};
