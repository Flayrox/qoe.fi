import React from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";

export const Navbar = () => {
  return (
    <nav className="fixed top-6 left-0 right-0 z-50 px-6 pointer-events-none">
      <div className="max-w-5xl mx-auto glass-panel rounded-full px-8 py-4 flex justify-between items-center pointer-events-auto">
        <div className="flex items-center gap-12">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight text-foreground">
            QOE.FI
          </Link>
          <div className="hidden md:flex gap-8 items-center">
            <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors font-body text-sm font-medium">
              Platform
            </Link>
            <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors font-body text-sm font-medium">
              Benefits
            </Link>
            <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors font-body text-sm font-medium">
              Security
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link href="/login" className="hidden md:block text-muted-foreground font-mono text-xs tracking-widest uppercase hover:text-foreground transition-colors">
            Login
          </Link>
          <Link href="/login" className={cn(buttonVariants({ variant: "default", size: "sm" }), "rounded-full px-6 uppercase tracking-widest text-[10px] font-mono")}>
            Early Access
          </Link>
        </div>
      </div>
    </nav>
  );
};
