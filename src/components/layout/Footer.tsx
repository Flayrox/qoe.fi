import React from "react";
import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="mt-20 border-t border-border/30 bg-muted/30 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        <div className="flex flex-col gap-6">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight text-foreground">
            QOE.FI
          </Link>
          <p className="font-body text-sm text-muted-foreground leading-relaxed max-w-[250px]">
            © 2024 QOE.FI. Crafted for the curious minds in the European creator economy.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <h4 className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-2">Legal</h4>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">GDPR Compliance</Link>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
        </div>
        <div className="flex flex-col gap-4">
          <h4 className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-2">Platform</h4>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Creator Studio</Link>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Reader Experience</Link>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">API Docs</Link>
        </div>
        <div className="flex flex-col gap-4">
          <h4 className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-2">Connect</h4>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Twitter</Link>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Substack</Link>
          <Link href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">LinkedIn</Link>
        </div>
      </div>
    </footer>
  );
};
