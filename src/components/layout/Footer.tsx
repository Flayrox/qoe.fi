import React from "react";
import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="mt-20 border-t border-outline-variant/30 bg-surface-container/30 backdrop-blur-sm">
      <div className="max-w-container-max mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        <div className="flex flex-col gap-6">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight text-primary">
            QOE.FI
          </Link>
          <p className="font-body text-sm text-on-surface-variant leading-relaxed max-w-[250px]">
            © 2024 QOE.FI. Crafted for the curious minds in the European creator economy.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <h4 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase mb-2">Legal</h4>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">GDPR Compliance</Link>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">Privacy Policy</Link>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">Terms of Service</Link>
        </div>
        <div className="flex flex-col gap-4">
          <h4 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase mb-2">Platform</h4>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">Creator Studio</Link>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">Reader Experience</Link>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">API Docs</Link>
        </div>
        <div className="flex flex-col gap-4">
          <h4 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase mb-2">Connect</h4>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">Twitter</Link>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">Substack</Link>
          <Link href="#" className="font-body text-sm text-on-surface-variant hover:text-accent transition-colors">LinkedIn</Link>
        </div>
      </div>
    </footer>
  );
};
