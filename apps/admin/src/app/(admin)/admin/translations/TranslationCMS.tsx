"use client";

import React, { useState, useTransition } from "react";
import { Search, Save, Trash2, Globe, AlertCircle, Sparkles, Filter, X, Download, Upload } from "lucide-react";
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
  const [showModal, setShowModal] = useState(false);

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

  // Get list of modified translations (diff) compared to starting state
  const getDiff = () => {
    const diffList: { key: string; lang: "fr" | "en"; oldVal: string; newVal: string }[] = [];

    allKeys.forEach((key) => {
      // Check FR
      const oldFr = initialOverrides.fr?.[key] || "";
      const newFr = overrides.fr?.[key] || "";
      if (oldFr !== newFr) {
        diffList.push({
          key,
          lang: "fr",
          oldVal: oldFr || `(Texte par défaut: ${defaultFr[key] || ""})`,
          newVal: newFr || "(Remis à zéro)",
        });
      }

      // Check EN
      const oldEn = initialOverrides.en?.[key] || "";
      const newEn = overrides.en?.[key] || "";
      if (oldEn !== newEn) {
        diffList.push({
          key,
          lang: "en",
          oldVal: oldEn || `(Default text: ${defaultEn[key] || ""})`,
          newVal: newEn || "(Reset to default)",
        });
      }
    });

    return diffList;
  };

  const diff = getDiff();
  const isDirty = diff.length > 0;

  const parseCSVLine = (line: string) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM for Excel formatting
    csvContent += "Key,Default FR,Default EN,Override FR,Override EN\n";
    
    allKeys.forEach((key) => {
      const defFr = `"${(defaultFr[key] || "").replace(/"/g, '""')}"`;
      const defEn = `"${(defaultEn[key] || "").replace(/"/g, '""')}"`;
      const overFr = `"${(overrides.fr?.[key] || "").replace(/"/g, '""')}"`;
      const overEn = `"${(overrides.en?.[key] || "").replace(/"/g, '""')}"`;
      csvContent += `"${key}",${defFr},${defEn},${overFr},${overEn}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "qoe_translations_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(overrides, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", "qoe_translations_overrides.json");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(content);
          if (parsed && (parsed.fr || parsed.en)) {
            setOverrides({
              fr: parsed.fr || {},
              en: parsed.en || {},
            });
            setSaveStatus("idle");
            alert("Surcharges de traduction JSON chargées avec succès ! Cliquez sur Enregistrer pour appliquer.");
          } else {
            alert("Format de fichier JSON invalide. Il doit contenir des objets 'fr' ou 'en'.");
          }
        } catch (err) {
          alert("Échec de la lecture du fichier JSON.");
        }
      } else if (file.name.endsWith(".csv")) {
        try {
          const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
          if (lines.length < 2) return;
          
          const newFr: Record<string, string> = {};
          const newEn: Record<string, string> = {};

          for (let i = 1; i < lines.length; i++) {
            const columns = parseCSVLine(lines[i]);
            if (columns.length >= 5) {
              const key = columns[0];
              const overFr = columns[3];
              const overEn = columns[4];

              if (overFr && overFr.trim() !== "") newFr[key] = overFr;
              if (overEn && overEn.trim() !== "") newEn[key] = overEn;
            }
          }

          setOverrides({ fr: newFr, en: newEn });
          setSaveStatus("idle");
          alert("Fichier de traduction CSV chargé avec succès ! Cliquez sur Enregistrer pour appliquer.");
        } catch (err) {
          alert("Échec de la lecture du fichier CSV.");
        }
      }
    };
    reader.readAsText(file);
  };

  const confirmSave = () => {
    setShowModal(false);
    startTransition(async () => {
      try {
        const changesSummaryList = diff.map(d => ({
          key: d.key,
          lang: d.lang,
          oldValue: d.oldVal,
          newValue: d.newVal
        }));
        const res = await saveTranslationOverrides(overrides, changesSummaryList);
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
    <div className="space-y-6 max-w-6xl mx-auto font-sans text-neutral-900 pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-neutral-100 pb-4 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            Base de traduction dynamique
            <Sparkles className="w-4 h-4 text-[#EE4B2B]" />
          </h1>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Surchargez les textes du site en direct dans la base de données.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1 text-[11px] text-neutral-600 font-bold border border-neutral-200 px-3 py-1.5 rounded-lg hover:bg-neutral-50 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="inline-flex items-center gap-1 text-[11px] text-neutral-600 font-bold border border-neutral-200 px-3 py-1.5 rounded-lg hover:bg-neutral-50 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
          
          <label className="inline-flex items-center gap-1 text-[11px] text-neutral-600 font-bold border border-neutral-200 px-3 py-1.5 rounded-lg hover:bg-neutral-50 transition-all cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Import
            <input
              type="file"
              accept=".csv,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {overriddenCount > 0 && (
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-red-600 font-bold border border-neutral-200 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:border-red-100 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Réinitialiser tout
            </button>
          )}
          
          {isDirty && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1 text-[11px] bg-[#EE4B2B] text-white font-bold px-3 py-1.5 rounded-lg hover:opacity-95 transition-all cursor-pointer shadow-sm animate-in fade-in zoom-in-95 duration-200"
            >
              <Save className="w-3.5 h-3.5" /> Enregistrer ({diff.length})
            </button>
          )}
        </div>
      </div>

      {/* Mini Active Overrides Status Bar */}
      {overriddenCount > 0 && (
        <div className="bg-orange-50/50 border border-orange-200/50 px-3 py-2 rounded-xl flex items-center gap-2 text-[10px] text-orange-800">
          <Globe className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span>
            <strong>{overriddenCount} surcharges</strong> actives en base de données.
          </span>
        </div>
      )}

      {/* Dense Controls Row */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 flex flex-col md:flex-row gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Rechercher par clé ou texte..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-50 border border-neutral-200 rounded-lg pl-8.5 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
          />
        </div>

        {/* Namespace Select */}
        <div className="flex items-center gap-1.5 w-full md:w-auto shrink-0">
          <Filter className="w-3.5 h-3.5 text-neutral-400 hidden md:block" />
          <select
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            className="w-full md:w-40 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none cursor-pointer"
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

      {/* Save Notification */}
      {saveStatus !== "idle" && (
        <div className={`p-3 rounded-lg border flex items-center gap-2 text-[11px] font-bold ${
          saveStatus === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-red-50 border-red-200 text-[#EE4B2B]"
        }`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>
            {saveStatus === "success" 
              ? "Modifications enregistrées et cache revalidé !" 
              : "Une erreur est survenue lors de l'enregistrement."}
          </span>
        </div>
      )}

      {/* High-density grid-table of keys */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-xs">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 bg-neutral-50 border-b border-neutral-200 px-4 py-2 text-[10px] uppercase font-bold text-neutral-400 select-none">
          <div className="col-span-3">Clé / Identifiant</div>
          <div className="col-span-4">🇫🇷 Version Française</div>
          <div className="col-span-4">🇬🇧 Version Anglaise</div>
          <div className="col-span-1 text-center">Reset</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
          {filteredKeys.length === 0 ? (
            <div className="text-center py-12 text-xs text-neutral-400 bg-neutral-50/20">
              Aucune clé de traduction trouvée.
            </div>
          ) : (
            filteredKeys.map((key) => {
              const defaultFrVal = defaultFr[key] || "";
              const defaultEnVal = defaultEn[key] || "";
              
              const isOverriddenFr = overrides.fr?.[key] !== undefined;
              const isOverriddenEn = overrides.en?.[key] !== undefined;
              const isAnyOverridden = isOverriddenFr || isOverriddenEn;

              // Extract namespace badge for display
              const parts = key.split(".");
              const namespace = parts[0];
              const restKey = parts.slice(1).join(".");

              return (
                <div 
                  key={key} 
                  className={`grid grid-cols-12 gap-4 px-4 py-2.5 items-center hover:bg-neutral-50/30 transition-colors ${
                    isAnyOverridden ? "bg-red-50/5" : ""
                  }`}
                >
                  {/* Key Column */}
                  <div className="col-span-3 min-w-0 pr-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase font-bold bg-neutral-100 text-neutral-500 rounded px-1 w-max">
                        {namespace}
                      </span>
                      <span className="text-[11px] font-semibold text-neutral-800 break-all select-all leading-tight" title={key}>
                        {restKey}
                      </span>
                    </div>
                  </div>

                  {/* FR Translation Input */}
                  <div className="col-span-4 space-y-1">
                    <span className="text-[10px] text-neutral-400 block truncate leading-none" title={defaultFrVal}>
                      Défaut: {defaultFrVal}
                    </span>
                    <input
                      type="text"
                      value={overrides.fr?.[key] ?? ""}
                      placeholder={defaultFrVal}
                      onChange={(e) => handleOverrideChange("fr", key, e.target.value)}
                      className={`w-full bg-neutral-50/30 border rounded-lg px-2 py-1 text-[11px] focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] focus:bg-white outline-none transition-colors ${
                        isOverriddenFr ? "border-[#EE4B2B]/40 bg-red-50/10 font-medium" : "border-neutral-200"
                      }`}
                    />
                  </div>

                  {/* EN Translation Input */}
                  <div className="col-span-4 space-y-1">
                    <span className="text-[10px] text-neutral-400 block truncate leading-none" title={defaultEnVal}>
                      Default: {defaultEnVal}
                    </span>
                    <input
                      type="text"
                      value={overrides.en?.[key] ?? ""}
                      placeholder={defaultEnVal}
                      onChange={(e) => handleOverrideChange("en", key, e.target.value)}
                      className={`w-full bg-neutral-50/30 border rounded-lg px-2 py-1 text-[11px] focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] focus:bg-white outline-none transition-colors ${
                        isOverriddenEn ? "border-[#EE4B2B]/40 bg-red-50/10 font-medium" : "border-neutral-200"
                      }`}
                    />
                  </div>

                  {/* Clear Button */}
                  <div className="col-span-1 flex justify-center">
                    {isAnyOverridden ? (
                      <button
                        type="button"
                        onClick={() => handleClearKey(key)}
                        title="Réinitialiser"
                        className="p-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Save Banner (only if dirty) */}
      {isDirty && (
        <div className="fixed bottom-6 right-6 z-40 bg-white border border-neutral-200 rounded-2xl px-5 py-3 shadow-xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-neutral-800">
              Modifications en attente
            </span>
            <span className="text-[10px] text-neutral-400">
              {diff.length} clé(s) modifiée(s)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 text-xs bg-[#EE4B2B] text-white font-bold px-4 py-2.5 rounded-xl hover:opacity-95 transition-all cursor-pointer shadow-sm"
          >
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      )}

      {/* Confirmation Diffs Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Récapitulatif des modifications</h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">Vérifiez la liste de vos changements avant de les appliquer en ligne :</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of changes */}
            <div className="max-h-64 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200/80 rounded-xl p-3 bg-neutral-50/50">
              {diff.map((item, index) => (
                <div key={index} className="py-2 first:pt-0 last:pb-0 text-xs flex flex-col gap-1">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-neutral-800 truncate break-all pr-4">{item.key}</span>
                    <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600 shrink-0">
                      {item.lang === "fr" ? "🇫🇷 FR" : "🇬🇧 EN"}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 flex-wrap">
                    <span className="line-through text-neutral-400 truncate max-w-[200px]" title={item.oldVal}>{item.oldVal}</span>
                    <span>→</span>
                    <span className="font-bold text-[#EE4B2B] truncate max-w-[240px]" title={item.newVal}>{item.newVal}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold cursor-pointer text-neutral-600"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={confirmSave}
                className="px-3.5 py-2 rounded-lg bg-[#EE4B2B] text-white hover:opacity-95 text-xs font-bold cursor-pointer shadow-sm"
              >
                {isPending ? "Sauvegarde..." : "Confirmer l'enregistrement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
