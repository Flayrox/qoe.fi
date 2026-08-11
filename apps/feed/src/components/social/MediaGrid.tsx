"use client";

import { useState } from "react";
import Image from "next/image";
import { Info, Play } from "lucide-react";

export interface MediaItem {
  id?: string;
  url: string;
  type?: string; // "IMAGE" | "VIDEO"
  altText?: string | null;
}

interface MediaGridProps {
  attachments?: MediaItem[] | null;
  legacyImageUrl?: string | null;
  onMediaClick?: (index: number) => void;
}

export function MediaGrid({ attachments, legacyImageUrl, onMediaClick }: MediaGridProps) {
  const [activeAltText, setActiveAltText] = useState<string | null>(null);

  // Normalisation des médias : soit le tableau d'attachements, soit fallback sur imageUrl
  const mediaList: MediaItem[] =
    attachments && attachments.length > 0
      ? attachments
      : legacyImageUrl
      ? [{ url: legacyImageUrl, type: "IMAGE", altText: null }]
      : [];

  if (mediaList.length === 0) return null;

  const count = mediaList.length;

  const handleItemClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (onMediaClick) {
      onMediaClick(index);
    }
  };

  const handleAltClick = (e: React.MouseEvent, altText: string) => {
    e.stopPropagation();
    setActiveAltText((prev) => (prev === altText ? null : altText));
  };

  return (
    <div className="relative mt-3 rounded-2xl overflow-hidden border border-border/60 bg-muted/20">
      {/* Popover Alt-Text */}
      {activeAltText && (
        <div className="p-3 bg-card/95 backdrop-blur-md border-b border-border text-xs text-foreground flex items-start gap-2 animate-in fade-in-50 duration-150">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-xs mb-0.5 text-foreground">Texte d'accessibilité (Alt-Text) :</p>
            <p className="text-muted-foreground leading-relaxed">{activeAltText}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveAltText(null);
            }}
            className="text-muted-foreground hover:text-foreground text-xs font-bold px-1.5 py-0.5 rounded hover:bg-muted"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1 Média */}
      {count === 1 && (
        <div
          onClick={(e) => handleItemClick(e, 0)}
          className="relative w-full aspect-video sm:aspect-[16/9] cursor-pointer group overflow-hidden bg-black/5"
        >
          {mediaList[0].type === "VIDEO" ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <video src={mediaList[0].url} controls className="w-full h-full object-contain" />
            </div>
          ) : (
            <Image
              src={mediaList[0].url}
              alt={mediaList[0].altText || "Image de la pensée"}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 640px) 100vw, 600px"
            />
          )}

          {/* Badge ALT */}
          {mediaList[0].altText && (
            <button
              onClick={(e) => handleAltClick(e, mediaList[0].altText!)}
              className="absolute bottom-2 left-2 z-10 px-2 py-0.5 text-[11px] font-bold text-white bg-black/70 backdrop-blur-sm rounded-md border border-white/20 hover:bg-black/90 transition-colors"
            >
              ALT
            </button>
          )}
        </div>
      )}

      {/* 2 Médias (Côte à côte 50/50) */}
      {count === 2 && (
        <div className="grid grid-cols-2 gap-0.5 aspect-[16/9] w-full">
          {mediaList.slice(0, 2).map((item, idx) => (
            <div
              key={item.id || idx}
              onClick={(e) => handleItemClick(e, idx)}
              className="relative w-full h-full cursor-pointer group overflow-hidden bg-black/5"
            >
              <Image
                src={item.url}
                alt={item.altText || `Image ${idx + 1}`}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                sizes="300px"
              />
              {item.altText && (
                <button
                  onClick={(e) => handleAltClick(e, item.altText!)}
                  className="absolute bottom-2 left-2 z-10 px-2 py-0.5 text-[11px] font-bold text-white bg-black/70 backdrop-blur-sm rounded-md border border-white/20 hover:bg-black/90 transition-colors"
                >
                  ALT
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3 Médias (1 Grand à gauche + 2 empilés à droite) */}
      {count === 3 && (
        <div className="grid grid-cols-2 gap-0.5 aspect-[16/9] w-full">
          {/* Main Left Item */}
          <div
            onClick={(e) => handleItemClick(e, 0)}
            className="relative w-full h-full cursor-pointer group overflow-hidden bg-black/5"
          >
            <Image
              src={mediaList[0].url}
              alt={mediaList[0].altText || "Image 1"}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="300px"
            />
            {mediaList[0].altText && (
              <button
                onClick={(e) => handleAltClick(e, mediaList[0].altText!)}
                className="absolute bottom-2 left-2 z-10 px-2 py-0.5 text-[11px] font-bold text-white bg-black/70 backdrop-blur-sm rounded-md border border-white/20 hover:bg-black/90 transition-colors"
              >
                ALT
              </button>
            )}
          </div>

          {/* Stacked Right Items */}
          <div className="grid grid-rows-2 gap-0.5 w-full h-full">
            {mediaList.slice(1, 3).map((item, idx) => {
              const actualIdx = idx + 1;
              return (
                <div
                  key={item.id || actualIdx}
                  onClick={(e) => handleItemClick(e, actualIdx)}
                  className="relative w-full h-full cursor-pointer group overflow-hidden bg-black/5"
                >
                  <Image
                    src={item.url}
                    alt={item.altText || `Image ${actualIdx + 1}`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    sizes="300px"
                  />
                  {item.altText && (
                    <button
                      onClick={(e) => handleAltClick(e, item.altText!)}
                      className="absolute bottom-2 left-2 z-10 px-2 py-0.5 text-[11px] font-bold text-white bg-black/70 backdrop-blur-sm rounded-md border border-white/20 hover:bg-black/90 transition-colors"
                    >
                      ALT
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4 Médias (Grille 2x2) */}
      {count >= 4 && (
        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 aspect-[16/9] w-full">
          {mediaList.slice(0, 4).map((item, idx) => (
            <div
              key={item.id || idx}
              onClick={(e) => handleItemClick(e, idx)}
              className="relative w-full h-full cursor-pointer group overflow-hidden bg-black/5"
            >
              <Image
                src={item.url}
                alt={item.altText || `Image ${idx + 1}`}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                sizes="300px"
              />
              {item.altText && (
                <button
                  onClick={(e) => handleAltClick(e, item.altText!)}
                  className="absolute bottom-2 left-2 z-10 px-2 py-0.5 text-[11px] font-bold text-white bg-black/70 backdrop-blur-sm rounded-md border border-white/20 hover:bg-black/90 transition-colors"
                >
                  ALT
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
