// =====================================================================
// ✏️ EditableText.tsx — texte éditable in-situ (pattern validé HeroBlock)
// En live : rendu pur, zéro surcharge. En editable : contentEditable avec
// contour pointillé au survol, commit au blur (diff avant push histoire).
// =====================================================================

import React from 'react';
import type { TemplateRenderContext } from '../schema';

interface EditableTextProps {
  blockId: string;
  propKey: string;
  value: string;
  context: TemplateRenderContext;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'a' | 'div';
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}

export function EditableText({
  blockId,
  propKey,
  value,
  context,
  as = 'p',
  className = '',
  placeholder,
  multiline = true,
}: EditableTextProps) {
  const editable = context.mode === 'editable';
  const Tag = as as 'p';

  if (!editable) {
    if (!value) return null;
    return <Tag className={className}>{value}</Tag>;
  }

  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-node-prop={propKey}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onBlur={(e) => {
        const text = e.currentTarget.textContent?.trim() ?? '';
        if (text !== value) {
          context.onUpdateBlockProps?.(blockId, { [propKey]: text });
        }
      }}
      className={`cursor-text rounded-sm hover:outline-dashed hover:outline-1 hover:outline-primary/50 focus:outline-solid focus:outline-2 focus:outline-primary ${className}`}
      data-placeholder={placeholder}
    >
      {value}
    </Tag>
  );
}
