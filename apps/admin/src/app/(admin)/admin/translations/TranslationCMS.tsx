"use client";

import React, { useState, useTransition } from "react";
import { Search, Save, Trash2, Globe, AlertCircle, Sparkles, Filter } from "lucide-react";
import { saveTranslationOverrides } from "../actions";

interface TranslationCMSProps {
  defaultFr: Record<string, string>;
  defaultEn: Record<string, string>;
  initialOverrides: Record<string, any>;
}

export function TranslationCMS({ defaultFr, defaultEn, initialOverrides }: TranslationCMSProps) {
  const [overrides, setOverrides] = useState<Record<string, any>>(initialOverrides);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNamespace, setSelectedNamespace] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Get all unique keys from French (primary) and English
  const allKeys = Array.from(new Set([...Object.keys(defaultFr), ...Object.keys(defaultEn)])).sort();

  // Extract unique namespaces (first segment of the key, e.g. "login" from "login.title")
  const namespaces = Array.from(
    new Set(allKeys.map((key) => key.split(".")[0]))
  ).sort();

  // Filter keys based on search term and namespace
  const filteredKeys = allKeys.filter((key) => {
    const namespaceMatches = selectedNamespace === "all" || key.startsWith(selectedNamespace + ".");
    
    const frVal = defaultFr[key] || "";
    const enVal = defaultEn[key] || "";
    const frOverride = overrides.fr?.[key] || "";
    const enOverride = overrides.en?.[key] || "";

    const searchMatches =
      searchTerm === "" ||
      key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      frVal.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enVal.toLowerCase().includes(searchTerm.toLowerCase()) ||
      frOverride.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enOverride.toLowerCase().includes(searchTerm.toLowerCase());

    return namespaceMatches && searchMatches;
  });

  const handleOverrideChange = (lang: "fr" | "en", key: string, val: string) => {
    setSaveStatus("idle");
    setOverrides((prev) => {
      const nextLang = { ...(prev[lang] || {}) };
      if (val.trim() === "") {
        delete nextLang[key];
      } else {
        nextLang[key] = val;
      }
      return {
        ...prev,
        [lang]: nextLang,
      };
    });
  };

  const handleClearKey = (key: string) => {
    setSaveStatus("idle");
    setOverrides((prev) => {
      const nextFr = { ...(prev.fr || {}) };
      const nextEn = { ...(prev.en || {}) };
      delete nextFr[key];
      delete nextEn[key];
      return {
        fr: nextFr,
        en: nextEn,
      };
    });
  };

  const handleResetAll = () => {
    if (confirm("Voulez-vous vraiment supprimer TOUTES les surcharges de traduction ? Cela remettra le site dans son état par défaut.")) {
      setOverrides({ fr: {}, en: {} });
      setSaveStatus("idle");
    }
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const res = await saveTranslationOverrides(overrides);
        if (res.success) {
          setSaveStatus("success");
          setTimeout(() => setSaveStatus("idle"), 3000);
        } else {
          setSaveStatus("error");
        }
      } catch (err) {
        setSaveStatus("error");
      }
    });
  };

  // Stats
  const overriddenCount = 
    Object.keys(overrides.fr || {}).length + 
    Object.keys(overrides.en || {}).length;

  return (
    <div className="space-y-8 max-w-6xl mx-auto font-sans text-neutral-900 pb-16">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-neutral-100 pb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Base de traduction dynamique
            <Sparkles className="w-5 h-5 text-[#EE4B2B] animate-pulse" />
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Modifiez et surchargez en direct n'importe quel texte du site (feed, login, onboarding, settings) sans redéploiement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-red-600 font-semibold border border-neutral-200 px-3.5 py-2.5 rounded-xl hover:bg-red-50 hover:border-red-100 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Réinitialiser
          </button>
          
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 text-xs bg-[#EE4B2B] text-white font-bold px-4 py-2.5 rounded-xl hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
          >
            <Save className="w-4 h-4" />
            {isPending ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </div>
      </div>

      {/* Info Warning Banner if active overrides exist */}
      {overriddenCount > 0 && (
        <div className="bg-orange-50 border border-orange-200/60 p-4 rounded-2xl flex gap-3 text-xs text-orange-800 leading-normal">
          <Globe className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Surcharges actives en base de données</span> : Vous avez actuellement <strong>{overriddenCount}</strong> clés de traduction surchargées. Ces valeurs remplacent les textes par défaut stockés dans les fichiers JSON.
          </div>
        </div>
      )}

      {/* Filters & Search Row */}
      <div className="bg-white border border-neutral-200/60 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Rechercher par clé de traduction ou contenu..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
          />
        </div>

        {/* Namespace Select */}
        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
          <Filter className="w-4 h-4 text-neutral-400 hidden md:block" />
          <select
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            className="w-full md:w-48 bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none cursor-pointer"
          >
            <option value="all">Tous les modules</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notification Toast Message */}
      {saveStatus !== "idle" && (
        <div className={`p-4 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
          saveStatus === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-red-50 border-red-200 text-[#EE4B2B]"
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {saveStatus === "success" 
              ? "Traductions enregistrées et mises en cache avec succès !" 
              : "Une erreur est survenue lors de la sauvegarde."}
          </span>
        </div>
      )}

      {/* Keys list */}
      <div className="space-y-4">
        <div className="flex justify-between items-center text-xs text-neutral-400 px-1">
          <span>Clés de traduction trouvées : <strong>{filteredKeys.length}</strong></span>
        </div>

        {filteredKeys.length === 0 ? (
          <div className="text-center py-16 text-neutral-400 text-sm border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
            Aucune clé de traduction ne correspond à votre recherche.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredKeys.map((key) => {
              const defaultFrVal = defaultFr[key] || "";
              const defaultEnVal = defaultEn[key] || "";
              
              const isOverriddenFr = overrides.fr?.[key] !== undefined;
              const isOverriddenEn = overrides.en?.[key] !== undefined;
              const isAnyOverridden = isOverriddenFr || isOverriddenEn;

              return (
                <div 
                  key={key} 
                  className={`bg-white border rounded-2xl p-6 shadow-2xs space-y-4 transition-colors ${
                    isAnyOverridden ? "border-[#EE4B2B]/40 bg-red-50/5" : "border-neutral-200/60"
                  }`}
                >
                  {/* Header / Key title & Reset */}
                  <div className="flex justify-between items-start border-b border-neutral-100 pb-3 gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Clé</span>
                      <span className="text-sm font-semibold tracking-tight text-neutral-900 break-all select-all">
                        {key}
                      </span>
                    </div>

                    {isAnyOverridden && (
                      <button
                        type="button"
                        onClick={() => handleClearKey(key)}
                        title="Réinitialiser cette clé aux valeurs par défaut"
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Editors */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* French Translation */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-neutral-500 flex items-center gap-1">
                          🇫🇷 Français
                        </span>
                        <span className="text-neutral-400 truncate max-w-[200px]" title={defaultFrVal}>
                          Défaut: {defaultFrVal}
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={overrides.fr?.[key] ?? ""}
                        placeholder={defaultFrVal}
                        onChange={(e) => handleOverrideChange("fr", key, e.target.value)}
                        className={`w-full bg-neutral-50/50 border rounded-xl p-3 text-xs leading-relaxed focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] focus:bg-white outline-none resize-y transition-colors ${
                          isOverriddenFr ? "border-[#EE4B2B]/30" : "border-neutral-200"
                        }`}
                      />
                    </div>

                    {/* English Translation */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-neutral-500 flex items-center gap-1">
                          🇬🇧 English
                        </span>
                        <span className="text-neutral-400 truncate max-w-[200px]" title={defaultEnVal}>
                          Default: {defaultEnVal}
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={overrides.en?.[key] ?? ""}
                        placeholder={defaultEnVal}
                        onChange={(e) => handleOverrideChange("en", key, e.target.value)}
                        className={`w-full bg-neutral-50/50 border rounded-xl p-3 text-xs leading-relaxed focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] focus:bg-white outline-none resize-y transition-colors ${
                          isOverriddenEn ? "border-[#EE4B2B]/30" : "border-neutral-200"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Save Bar */}
      <div className="fixed bottom-6 right-6 z-50 bg-white border border-neutral-200/80 rounded-2xl px-6 py-4 shadow-xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <span className="text-xs text-neutral-500 font-medium">
          {filteredKeys.length} clé(s) filtrée(s)
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 text-xs bg-[#EE4B2B] text-white font-bold px-4 py-2.5 rounded-xl hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
        >
          <Save className="w-4 h-4" />
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
