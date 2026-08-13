'use client';

import { useState, useEffect } from 'react';
import { Type } from 'lucide-react';

export function AccessibilityMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [fontSize, setFontSize] = useState('text-base');
  const [fontFamily, setFontFamily] = useState('font-serif');

  // Load saved preferences
  useEffect(() => {
    const savedFontSize = localStorage.getItem('qoe-fontSize');
    const savedFontFamily = localStorage.getItem('qoe-fontFamily');

    if (savedFontSize) setFontSize(savedFontSize);
    if (savedFontFamily) setFontFamily(savedFontFamily);
  }, []);

  // Apply preferences
  useEffect(() => {
    const articleBody = document.getElementById('article-body');
    if (articleBody) {
      // Remove old classes
      articleBody.classList.remove('text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl');
      articleBody.classList.remove('font-serif', 'font-sans', 'font-mono');

      // Add new classes
      articleBody.classList.add(fontSize, fontFamily);

      // Apply dyslexia friendly line height if mono or sans is chosen (simulating dyslexia friendly)
      if (fontFamily !== 'font-serif') {
        articleBody.classList.add('leading-loose');
      } else {
        articleBody.classList.remove('leading-loose');
      }
    }
  }, [fontSize, fontFamily]);

  const updatePreference = (key: string, value: string, setter: (value: string) => void) => {
    localStorage.setItem(`qoe-${key}`, value);
    setter(value);
  };

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-background border shadow-sm hover:bg-muted transition-colors"
        aria-label="Accessibility options"
        title="Reading Settings"
      >
        <Type className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-64 p-4 bg-popover border shadow-xl rounded-2xl flex flex-col gap-6 origin-top-right animate-in fade-in zoom-in duration-200">
          {/* Font Size */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Text Size
            </label>
            <div className="flex bg-muted/50 rounded-lg p-1">
              {[
                { id: 'text-sm', label: 'A', size: 'text-xs' },
                { id: 'text-base', label: 'A', size: 'text-sm' },
                { id: 'text-lg', label: 'A', size: 'text-base' },
                { id: 'text-xl', label: 'A', size: 'text-lg' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => updatePreference('fontSize', s.id, setFontSize)}
                  className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all ${s.size} ${fontSize === s.id ? 'bg-background shadow-sm text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Typography
            </label>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => updatePreference('fontFamily', 'font-serif', setFontFamily)}
                className={`text-left px-3 py-2 text-sm rounded-md transition-all font-serif ${fontFamily === 'font-serif' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted'}`}
              >
                Merriweather (Classic)
              </button>
              <button
                onClick={() => updatePreference('fontFamily', 'font-sans', setFontFamily)}
                className={`text-left px-3 py-2 text-sm rounded-md transition-all font-sans ${fontFamily === 'font-sans' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted'}`}
              >
                Inter (Clean)
              </button>
              <button
                onClick={() => updatePreference('fontFamily', 'font-mono', setFontFamily)}
                className={`text-left px-3 py-2 text-sm rounded-md transition-all font-mono ${fontFamily === 'font-mono' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted'}`}
              >
                Dyslexia Friendly
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
