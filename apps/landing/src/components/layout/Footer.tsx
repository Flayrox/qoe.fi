import React from "react";
import Link from "next/link";
import { getLanguage } from "@qoe/i18n/server";
import { URLS } from "@qoe/config";

interface FooterLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

interface FooterProps {
  config?: Record<string, string>;
  locale?: string;
}

const DEFAULT_SECTIONS_FR: FooterSection[] = [
  {
    title: "Légal",
    links: [
      { label: "Conformité RGPD", href: "#" },
      { label: "Politique de confidentialité", href: "#" },
      { label: "Conditions d'utilisation", href: "#" }
    ]
  },
  {
    title: "Plateforme",
    links: [
      { label: "Studio Créateur", href: URLS.DASHBOARD },
      { label: "Espace Lecteur", href: URLS.APP },
      { label: "Docs API", href: `${URLS.API}/health`, isExternal: true }
    ]
  },
  {
    title: "Réseaux",
    links: [
      { label: "Twitter", href: "#" },
      { label: "Substack", href: "#" },
      { label: "LinkedIn", href: "#" }
    ]
  }
];

const DEFAULT_SECTIONS_EN: FooterSection[] = [
  {
    title: "Legal",
    links: [
      { label: "GDPR Compliance", href: "#" },
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" }
    ]
  },
  {
    title: "Platform",
    links: [
      { label: "Creator Studio", href: URLS.DASHBOARD },
      { label: "Reader Experience", href: URLS.APP },
      { label: "API Docs", href: `${URLS.API}/health`, isExternal: true }
    ]
  },
  {
    title: "Connect",
    links: [
      { label: "Twitter", href: "#" },
      { label: "Substack", href: "#" },
      { label: "LinkedIn", href: "#" }
    ]
  }
];

export const Footer = async ({ config, locale }: FooterProps) => {
  // Resolve locale if not passed
  const resolvedLocale = locale || (await getLanguage());

  // Get copyright from config or use default
  const copyrightText = config?.["footer_copyright"] || `© ${new Date().getFullYear()} QOE.FI. Crafted for the curious minds in the European creator economy.`;

  // Get sections based on active language
  const customSectionsJson = config?.[`footer_sections_${resolvedLocale}`] || config?.["footer_sections"];
  let footerSections = resolvedLocale === "en" ? DEFAULT_SECTIONS_EN : DEFAULT_SECTIONS_FR;

  if (customSectionsJson) {
    try {
      const parsed = JSON.parse(customSectionsJson);
      if (Array.isArray(parsed)) {
        footerSections = parsed;
      }
    } catch (e) {
      console.error("Failed to parse footer sections JSON:", e);
      // Fallback to default sections is already set
    }
  }

  return (
    <footer className="mt-20 border-t border-border/30 bg-muted/30 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 text-neutral-900 dark:text-neutral-100">
        {/* Brand & Copyright */}
        <div className="flex flex-col gap-6">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
            QOE.FI
          </Link>
          <p className="font-body text-xs text-neutral-500 leading-relaxed max-w-[250px] whitespace-pre-wrap">
            {copyrightText}
          </p>
        </div>

        {/* Dynamic Link columns */}
        {footerSections.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-4">
            <h4 className="font-sans text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
              {section.title}
            </h4>
            {section.links?.map((link, linkIdx) => {
              const isExt = link.isExternal || link.href?.startsWith("http");
              return (
                <Link
                  key={linkIdx}
                  href={link.href || "#"}
                  target={isExt ? "_blank" : undefined}
                  rel={isExt ? "noopener noreferrer" : undefined}
                  className="font-body text-sm text-neutral-500 hover:text-[#EE4B2B] transition-colors duration-200"
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </footer>
  );
};
