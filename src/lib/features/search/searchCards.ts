// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

/** An uploaded or integration-kept file by its type, or a link to an external address. */
export type DocumentKind = 'pdf' | 'text' | 'markdown' | 'link' | 'file';

export function documentKindOf(source: string | null, mime: string | null): DocumentKind {
  if (source === 'link') return 'link';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown') return 'markdown';
  if (mime === 'text/plain') return 'text';
  return 'file';
}

export const LEAD_LENGTH = 240;

/** Cut to about `max` characters at a word boundary, with an ellipsis. */
export function clipText(text: string, max = LEAD_LENGTH): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  const head = space > max * 0.6 ? cut.slice(0, space) : t.slice(0, max);
  return `${head.replace(/[\s.,;:!?–—-]+$/, '')}…`;
}

/** The host without "www.", short enough for a badge; '' when it isn't a URL. */
export function linkHost(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
