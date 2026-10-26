// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The exhaustive text of a page's doc for full-text search, every cell and mark
// included (summarizeBlocks makes the compact previews). Headings (weight B) stay
// apart from the body (C); the title (A) comes from nodes.title. Pure, so it
// runs inside the save chokepoint.

import sanitizeHtml from 'sanitize-html';
import { blockText, isUnknownType, type JsonNode } from '$lib/features/content';


export interface PageSearchText {
  /** Heading text — indexed at weight B. */
  headings: string;
  /** All other readable text — indexed at weight C. */
  body: string;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// sanitize-html re-encodes entities in its text output, and "&amp;" would index
// as the token "amp". &amp; goes last, so "&amp;lt;" doesn't cascade into "<".
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => {
      const n = parseInt(h, 16);
      return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&#(\d+);/g, (m, d) => {
      const n = parseInt(d, 10);
      return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// An HTML block's structure is unknown, so all markup goes.
function htmlToText(html: string): string {
  return collapse(decodeEntities(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })));
}

// Re-adds a semanticProperty mark's name, so the name is searchable beside its
// value ("status approved").
function textNodeText(node: JsonNode, propertyNames: boolean): string {
  const text = node.text ?? '';
  if (!propertyNames) return text;
  const sem = (node.marks ?? []).find((m) => m.type === 'semanticProperty' && m.attrs?.propName);
  return sem ? `${String(sem.attrs!.propName)} ${text}` : text;
}

// Blocks whose text lives in `attrs` or needs transforming; null falls through
// to the default recurse.
function specialText(node: JsonNode): string | null {
  // A block that declares its text answers for itself (content's facets).
  const own = blockText(node);
  if (own != null) return own;
  switch (node.type) {
    case 'htmlBlock':
      return htmlToText(String(node.attrs?.html ?? ''));
    case 'image':
      return String(node.attrs?.alt ?? node.attrs?.caption ?? '').trim();
    case 'diagram':
      return ''; // diagram source is syntax noise — skip
    case 'placeholder':
      // Stripped before persist (persistDocTx); this guards the recurse anyway.
      return '';
    case 'queryBlock':
      // Its results are viewer-scoped and other pages'; '' also keeps the
      // template's placeholder text out of this page's index.
      return '';
    default:
      return null;
  }
}

/**
 * `propertyNames: false` reads the text as a reader sees it, without property
 * names, for an excerpt rather than the index.
 */
export function extractSearchText(doc: unknown, { propertyNames = true }: { propertyNames?: boolean } = {}): PageSearchText {
  const headings: string[] = [];
  const body: string[] = [];

  function walk(node: JsonNode, inHeading: boolean): void {
    // A block this build cannot read says nothing to search: the page shows nothing of it (docs/architecture/blocks/anatomy.md, "Unknown blocks").
    if (isUnknownType(node)) return;
    if (typeof node.text === 'string') {
      (inHeading ? headings : body).push(textNodeText(node, propertyNames));
      return;
    }
    const special = specialText(node);
    if (special !== null) {
      if (special) body.push(special);
      return;
    }
    // A heading marks its whole subtree for weight B.
    const nowHeading = inHeading || node.type === 'heading';
    for (const child of node.content ?? []) walk(child, nowHeading);
  }

  const root = doc as JsonNode | null | undefined;
  for (const block of root?.content ?? []) walk(block, false);

  return { headings: collapse(headings.join(' ')), body: collapse(body.join(' ')) };
}
