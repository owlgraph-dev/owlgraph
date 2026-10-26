// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The highlight sentinels are control characters that never occur in extracted
// text, so the UI splits on them and renders <mark> with escaped interpolation,
// never {@html}.

export const HL_START = '\u0002';
export const HL_STOP = '\u0003';

export const HEADLINE_OPTS = `StartSel=${HL_START}, StopSel=${HL_STOP}, MaxFragments=1, MaxWords=18, MinWords=5`;

export interface SnippetPart {
  text: string;
  hl: boolean;
}

export function parseSnippet(s: string | null | undefined): SnippetPart[] {
  if (!s) return [];
  const parts: SnippetPart[] = [];
  const re = new RegExp(`${HL_START}([^${HL_STOP}]*)${HL_STOP}`, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index), hl: false });
    parts.push({ text: m[1], hl: true });
    last = re.lastIndex;
  }
  if (last < s.length) parts.push({ text: s.slice(last), hl: false });
  return parts;
}
