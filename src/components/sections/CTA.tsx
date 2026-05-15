"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { landingConfig } from "@/config/landing";

export const CTA = () => {
  const { cta } = landingConfig;

  return (
    <section className="py-32 px-6">
      <Reveal width="100%">
        <div className="max-w-4xl mx-auto bg-primary dark:bg-zinc-950 rounded-[2rem] p-16 md:p-24 text-center relative overflow-hidden shadow-2xl border border-white/10">
          {/* Decorative gradients */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent/20 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-white/5 rounded-full blur-[80px] -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10">
            <h2 className="font-display text-5xl md:text-7xl text-white mb-8 tracking-tight font-medium leading-tight">
              {cta.title}
            </h2>
            <p className="font-body text-lg text-white/70 mb-12 max-w-lg mx-auto leading-relaxed">
              {cta.description}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch sm:items-center max-w-md mx-auto">
               <input 
                type="email" 
                placeholder={cta.inputPlaceholder}
                className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 px-8 py-4 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent/50 w-full transition-all"
              />
              <Button size="lg" className="bg-white dark:bg-white text-primary dark:text-black hover:bg-white/90 rounded-xl whitespace-nowrap">
                {cta.buttonText}
              </Button>
            </div>
            <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mt-8">
              {cta.footerText}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
};
