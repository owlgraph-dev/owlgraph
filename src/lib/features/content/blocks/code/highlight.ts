// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One lowlight instance for the editor and the server renderer, so both
// highlight the same languages the same way.
import { createLowlight, common } from 'lowlight';
import { esc } from '$lib/platform/htmlEscape';

export const lowlight = createLowlight(common);

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

// lowlight emits only <span class="hljs-…"> around text; everything else is
// escaped. The server renderer has its own copy; the CodeArea primitive needs
// this one in the browser.
function toHtml(node: HastNode): string {
  if (node.type === 'text') return esc(node.value ?? '');
  const inner = (node.children ?? []).map(toHtml).join('');
  if (node.type !== 'element' || node.tagName !== 'span') return inner;
  const classes = node.properties?.className ?? [];
  return classes.length > 0 ? `<span class="${esc(classes.join(' '))}">${inner}</span>` : inner;
}

/**
 * Highlighted markup, everything else escaped: safe for `{@html}`. An unknown
 * language or a parse failure returns escaped plain text, never nothing.
 */
export function highlightToHtml(source: string, language: string): string {
  if (source === '') return '';
  if (language && language !== 'plaintext' && lowlight.registered(language)) {
    try {
      return ((lowlight.highlight(language, source).children ?? []) as HastNode[]).map(toHtml).join('');
    } catch {
      // plain text below
    }
  }
  return esc(source);
}
