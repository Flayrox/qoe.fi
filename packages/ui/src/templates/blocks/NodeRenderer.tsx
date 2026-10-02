// =====================================================================
// 🧩 NodeRenderer.tsx — rendu récursif des TemplateNode (AST v2)
// Server-pur : aucun hook. En live : HTML sémantique sans data-*.
// En editable : sélection oid + responsive sx.hiddenAt.
// =====================================================================

import React from 'react';
import type { TemplateNode, TemplateRenderContext } from '../schema';
import { EditableText } from './EditableText';

interface NodeRendererProps {
  nodes: TemplateNode[];
  blockId: string;
  blockProps: Record<string, unknown>;
  context: TemplateRenderContext;
  path?: string;
}

function hiddenClasses(sx?: TemplateNode['sx']): string {
  if (!sx?.hiddenAt || sx.hiddenAt.length === 0) return '';
  const h = sx.hiddenAt;
  if (h.includes('mobile') && h.includes('tablet')) return 'hidden lg:block';
  if (h.includes('mobile')) return 'hidden md:block';
  if (h.includes('tablet')) return 'hidden md:block lg:block';
  return '';
}

function resolveNodeText(node: TemplateNode, blockProps: Record<string, unknown>): string {
  if (node.textKey && typeof blockProps[node.textKey] === 'string') {
    return blockProps[node.textKey] as string;
  }
  if (typeof node.overrides?.text === 'string') return node.overrides.text as string;
  return node.textFallback ?? '';
}

export function NodeRenderer({
  nodes,
  blockId,
  blockProps,
  context,
  path = '',
}: NodeRendererProps) {
  const editable = context.mode === 'editable';
  return (
    <>
      {nodes.map((node, i) => {
        const nodePath = path ? `${path}/${i}` : `${i}`;
        const selected = editable && context.selectedOid === node.oid;
        const cls = `${hiddenClasses(node.sx)}${selected ? ' outline outline-2 outline-primary rounded-sm' : ''}`;

        const handleClick: React.MouseEventHandler = (e) => {
          if (!editable) return;
          e.stopPropagation();
          context.onSelectNode?.(node.oid, nodePath, blockId);
        };

        switch (node.kind) {
          case 'text': {
            const text = resolveNodeText(node, blockProps);
            if (editable && node.textKey) {
              return (
                <span key={node.oid} data-oid={node.oid} onClick={handleClick} className={cls}>
                  <EditableText
                    blockId={blockId}
                    propKey={node.textKey}
                    value={text}
                    context={context}
                    as={(node.tag as 'p' | 'span' | 'h1' | 'h2' | 'h3') ?? 'span'}
                  />
                </span>
              );
            }
            const Tag = (node.tag ?? 'span') as 'span';
            return (
              <Tag
                key={node.oid}
                {...(editable
                  ? { 'data-oid': node.oid, onClick: handleClick, className: cls }
                  : {})}
              >
                {text}
              </Tag>
            );
          }
          case 'button': {
            const text = resolveNodeText(node, blockProps);
            const href =
              typeof node.overrides?.href === 'string'
                ? (node.overrides.href as string)
                : undefined;
            return (
              <a
                key={node.oid}
                href={editable ? undefined : href}
                onClick={
                  editable
                    ? (e) => {
                        e.preventDefault();
                        handleClick(e);
                      }
                    : undefined
                }
                {...(editable ? { 'data-oid': node.oid } : {})}
                className={`inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground ${cls}`}
              >
                {text || 'Bouton'}
              </a>
            );
          }
          case 'badge': {
            const text = resolveNodeText(node, blockProps);
            return (
              <span
                key={node.oid}
                onClick={editable ? handleClick : undefined}
                {...(editable ? { 'data-oid': node.oid } : {})}
                className={`inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold ${cls}`}
              >
                {text}
              </span>
            );
          }
          case 'image': {
            const src =
              typeof node.overrides?.src === 'string' ? (node.overrides.src as string) : undefined;
            if (!src) return null;
            return (
              <img
                key={node.oid}
                src={src}
                alt={resolveNodeText(node, blockProps) || ''}
                onClick={editable ? handleClick : undefined}
                {...(editable ? { 'data-oid': node.oid } : {})}
                className={`max-w-full rounded-lg ${cls}`}
                loading="lazy"
              />
            );
          }
          case 'box':
          case 'flex':
          case 'stack':
          case 'slot':
          default: {
            return (
              <div
                key={node.oid}
                onClick={editable ? handleClick : undefined}
                {...(editable ? { 'data-oid': node.oid } : {})}
                className={`${node.kind === 'flex' ? 'flex gap-2' : ''} ${cls}`}
                style={node.sx?.order !== undefined ? { order: node.sx.order } : undefined}
              >
                {node.children && node.children.length > 0 && (
                  <NodeRenderer
                    nodes={node.children}
                    blockId={blockId}
                    blockProps={blockProps}
                    context={context}
                    path={nodePath}
                  />
                )}
              </div>
            );
          }
        }
      })}
    </>
  );
}
