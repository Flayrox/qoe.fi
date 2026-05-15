"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { ShieldCheck, Receipt, Globe, PenTool, Users } from "lucide-react";
import { landingConfig } from "@/config/landing";

const iconMap = {
  ShieldCheck: ShieldCheck,
  Receipt: Receipt,
  Globe: Globe,
  PenTool: PenTool,
  Users: Users,
};

export const BentoFeatures = () => {
  const { features } = landingConfig;

  return (
    <section className="py-24 px-6 max-w-5xl mx-auto">
      <div className="text-center mb-16">
        <Reveal>
          <span className="font-mono text-[10px] tracking-[0.2em] text-accent uppercase font-semibold mb-4 block">
            {features.tagline}
          </span>
        </Reveal>
        <Reveal delay={0.4}>
          <h2 className="font-display text-4xl md:text-5xl text-primary dark:text-white font-medium tracking-tight mb-6">
            {features.title}
          </h2>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.items.map((item, index) => {
          const Icon = iconMap[item.icon as keyof typeof iconMap];
          
          if (item.featured) {
            return (
              <Reveal key={item.id} delay={0.2 * (index + 1)} width="100%">
                <Card variant="cursor" className="md:col-span-2 flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1">
                    {Icon && <Icon className="text-accent mb-6 w-8 h-8" />}
                    <h3 className="font-display text-2xl text-primary dark:text-white mb-4">{item.title}</h3>
                    <p className="font-body text-sm text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex-1 bg-surface-container dark:bg-zinc-800/30 rounded-xl p-4 border border-outline-variant/10 shadow-inner">
                    <div className="h-2 w-3/4 bg-primary/20 rounded-full mb-2" />
                    <div className="h-2 w-1/2 bg-primary/10 rounded-full mb-4" />
                    <div className="h-20 w-full bg-white dark:bg-zinc-950 rounded-lg shadow-sm border border-outline-variant/10" />
                  </div>
                </Card>
              </Reveal>
            );
          }

          return (
            <Reveal key={item.id} delay={0.2 * (index + 1)} width="100%">
              <Card variant="cursor" className="h-full">
                {Icon && <Icon className="text-accent mb-6 w-8 h-8" />}
                <h3 className="font-display text-2xl text-primary dark:text-white mb-4">{item.title}</h3>
                <p className="font-body text-sm text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                  {item.description}
                </p>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
};
