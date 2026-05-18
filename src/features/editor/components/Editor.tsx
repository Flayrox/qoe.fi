"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface EditorProps extends React.HTMLAttributes<HTMLDivElement> {
  initialContent?: string;
}

export function Editor({ className, initialContent = "", ...props }: EditorProps) {
  const [content, setContent] = React.useState(initialContent);

  return (
    <div className={cn("flex flex-col min-h-[500px] w-full max-w-4xl mx-auto", className)} {...props}>
      <div className="flex items-center justify-between py-4 border-b border-border/40">
        <div className="flex gap-2">
          {/* Editor Toolbar Placeholders */}
          <button className="h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground text-sm flex items-center justify-center font-bold">B</button>
          <button className="h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground text-sm flex items-center justify-center italic">I</button>
          <button className="h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground text-sm flex items-center justify-center underline">U</button>
        </div>
        <div>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            Publish
          </button>
        </div>
      </div>
      <div className="flex-1 py-8">
        <textarea
          className="w-full h-full min-h-[400px] bg-transparent resize-none outline-none text-lg font-classical leading-relaxed placeholder:text-muted-foreground"
          placeholder="Start writing your masterpiece..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </div>
  );
}
