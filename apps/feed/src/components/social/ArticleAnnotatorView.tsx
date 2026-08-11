"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Highlighter,
  MessageSquare,
  ThumbsUp,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  X,
  Send,
  Loader2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  getArticleHighlightsAction,
  createHighlightAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
} from "@qoe/api-client";

export interface ArticleAnnotatorViewProps {
  article: {
    id: string;
    title: string;
    slug: string;
    content: string;
    readingTime?: number;
    createdAt: string | Date;
    author: {
      id: string;
      name?: string | null;
      username?: string | null;
      logoUrl?: string | null;
      subdomain?: string | null;
      customDomain?: string | null;
    };
  };
}

export function ArticleAnnotatorView({ article }: ArticleAnnotatorViewProps) {
  const [highlights, setHighlights] = useState<any[]>([]);
  const [isLoadingHighlights, setIsLoadingHighlights] = useState(true);
  const [activeTab, setActiveTab] = useState<"official" | "community" | "my">("official");
  const [selectedText, setSelectedText] = useState<string>("");
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [noteInput, setNoteInput] = useState<string>("");
  const [isNotePublic, setIsNotePublic] = useState<boolean>(true);
  const [isSubmittingHighlight, setIsSubmittingHighlight] = useState<boolean>(false);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [isSubmittingComment, setIsSubmittingComment] = useState<Record<string, boolean>>({});

  const articleRef = useRef<HTMLDivElement>(null);

  // Load article highlights
  useEffect(() => {
    async function loadHighlights() {
      try {
        const res = await getArticleHighlightsAction({ articleId: article.id });
        if (res.ok && res.data.highlights) {
          setHighlights(res.data.highlights);
        }
      } catch (err) {
        console.error("Error loading highlights:", err);
      } finally {
        setIsLoadingHighlights(false);
      }
    }
    loadHighlights();
  }, [article.id]);

  // Text selection handler
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setPopoverPos(null);
      setSelectedText("");
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 3) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setPopoverPos({
        top: Math.max(12, rect.top - 52),
        left: rect.left + rect.width / 2,
      });
    }
  };


  const handleCreateHighlight = async (isPublic: boolean) => {
    if (!selectedText || isSubmittingHighlight) return;

    setIsSubmittingHighlight(true);
    try {
      const res = await createHighlightAction({
        articleId: article.id,
        text: selectedText,
        note: noteInput.trim() || null,
        isPublic,
      });

      if (res.ok && res.data.highlight) {
        setHighlights((prev) => [res.data.highlight, ...prev]);
        setSelectedText("");
        setNoteInput("");
        setPopoverPos(null);
        window.getSelection()?.removeAllRanges();
      }
    } catch (err) {
      console.error("Error creating highlight:", err);
    } finally {
      setIsSubmittingHighlight(false);
    }
  };

  const handleUpvote = async (highlightId: string) => {
    try {
      const res = await upvoteHighlightAction({ highlightId });
      if (res.ok) {
        setHighlights((prev) =>
          prev.map((hl) =>
            hl.id === highlightId
              ? { ...hl, upvotesCount: res.data.upvotesCount, hasUpvoted: res.data.hasUpvoted }
              : hl
          )
        );
      }
    } catch (err) {
      console.error("Error upvoting highlight:", err);
    }
  };

  const handleAddComment = async (highlightId: string) => {
    const text = commentInputs[highlightId]?.trim();
    if (!text || isSubmittingComment[highlightId]) return;

    setIsSubmittingComment((prev) => ({ ...prev, [highlightId]: true }));
    try {
      const res = await createAnnotationCommentAction({ highlightId, content: text });
      if (res.ok && res.data.comment) {
        setHighlights((prev) =>
          prev.map((hl) =>
            hl.id === highlightId
              ? { ...hl, comments: [...(hl.comments || []), res.data.comment] }
              : hl
          )
        );
        setCommentInputs((prev) => ({ ...prev, [highlightId]: "" }));
      }
    } catch (err) {
      console.error("Error adding annotation comment:", err);
    } finally {
      setIsSubmittingComment((prev) => ({ ...prev, [highlightId]: false }));
    }
  };

  const officialHighlights = highlights.filter((hl) => hl.isOfficial);
  const communityHighlights = highlights.filter((hl) => hl.isPublic && !hl.isOfficial);
  const myHighlights = highlights.filter((hl) => !hl.isPublic && !hl.isOfficial);

  const displayedHighlights =
    activeTab === "official"
      ? officialHighlights
      : activeTab === "community"
      ? communityHighlights
      : myHighlights;

  return (
    <div className="relative min-h-screen bg-background text-foreground grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-7xl mx-auto">
      {/* Floating Selection Popover */}
      {popoverPos && selectedText && (
        <div
          style={{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }}
          className="fixed -translate-x-1/2 z-50 bg-popover/90 backdrop-blur-md border border-border p-2 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150"
        >
          <button
            onClick={() => handleCreateHighlight(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-muted hover:bg-muted/80 transition-colors"
          >
            <Highlighter className="w-3.5 h-3.5 text-amber-500" />
            <span>Surligner (Privé)</span>
          </button>
          <button
            onClick={() => handleCreateHighlight(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Annoter (Public Genius)</span>
          </button>
          <button
            onClick={() => {
              setPopoverPos(null);
              setSelectedText("");
            }}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Article Content (8 cols) */}
      <main className="lg:col-span-8 space-y-6 bg-card/40 border border-border/60 rounded-2xl p-6 backdrop-blur-md">
        <div className="space-y-2 border-b border-border/40 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{article.title}</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Par {article.author.name || article.author.username}</span>
            <span>•</span>
            <span>{article.readingTime || 5} min de lecture</span>
          </div>
        </div>

        {/* Article Body HTML */}
        <div
          ref={articleRef}
          onMouseUp={handleTextSelection}
          onTouchEnd={handleTextSelection}
          className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-foreground/90 selection:bg-amber-500/30 cursor-text"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

      </main>

      {/* Side Annotations Drawer (4 cols) */}
      <aside className="lg:col-span-4 space-y-4">
        {/* Navigation Filter Tabs */}
        <div className="flex items-center p-1 bg-card border border-border/60 rounded-2xl gap-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("official")}
            className={`flex-1 py-1.5 rounded-xl transition-all ${
              activeTab === "official"
                ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Auteur ({officialHighlights.length})
          </button>
          <button
            onClick={() => setActiveTab("community")}
            className={`flex-1 py-1.5 rounded-xl transition-all ${
              activeTab === "community"
                ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Public ({communityHighlights.length})
          </button>
          <button
            onClick={() => setActiveTab("my")}
            className={`flex-1 py-1.5 rounded-xl transition-all ${
              activeTab === "my"
                ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mes Notes ({myHighlights.length})
          </button>
        </div>

        {/* Highlights List */}
        <div className="space-y-3">
          {isLoadingHighlights && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!isLoadingHighlights && displayedHighlights.length === 0 && (
            <div className="p-6 text-center border border-dashed border-border rounded-2xl space-y-1">
              <p className="text-xs font-bold text-foreground">Aucune annotation</p>
              <p className="text-[11px] text-muted-foreground">
                Sélectionnez du texte dans l'article pour ajouter un surlignage ou une note.
              </p>
            </div>
          )}

          {!isLoadingHighlights &&
            displayedHighlights.map((hl) => (
              <div
                key={hl.id}
                className="bg-card border border-border/60 rounded-2xl p-4 space-y-3 shadow-2xs text-xs"
              >
                {/* Highlighted Quote text */}
                <div className="p-2.5 bg-amber-500/10 border-l-2 border-amber-500 rounded-r-xl font-medium italic text-foreground/90">
                  "{hl.text}"
                </div>

                {/* Optional Note */}
                {hl.note && <p className="text-foreground leading-relaxed font-normal">{hl.note}</p>}

                {/* Footer details & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                  <span>Par {hl.reader?.name || hl.reader?.username || "Auteur"}</span>

                  <div className="flex items-center gap-3">
                    {hl.isPublic && (
                      <button
                        onClick={() => handleUpvote(hl.id)}
                        className={`flex items-center gap-1 font-bold ${
                          hl.hasUpvoted ? "text-primary" : "hover:text-foreground"
                        }`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>{hl.upvotesCount || 0}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Comments section on public annotation */}
                {hl.isPublic && (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    {hl.comments?.map((c: any) => (
                      <div key={c.id} className="bg-muted/50 p-2 rounded-xl space-y-0.5">
                        <p className="font-bold text-[11px] text-foreground">
                          {c.author?.name || c.author?.username}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{c.content}</p>
                      </div>
                    ))}

                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        value={commentInputs[hl.id] || ""}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({ ...prev, [hl.id]: e.target.value }))
                        }
                        placeholder="Répondre à cette annotation..."
                        className="flex-1 px-2.5 py-1 text-[11px] bg-background border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => handleAddComment(hl.id)}
                        disabled={!commentInputs[hl.id]?.trim() || isSubmittingComment[hl.id]}
                        className="p-1.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                      >
                        {isSubmittingComment[hl.id] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}
