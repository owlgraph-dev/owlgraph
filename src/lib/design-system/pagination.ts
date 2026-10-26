// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A gap stands for at least two pages: a single skipped page takes no more room
// than the gap, so it is shown.
export type PageWindowItem = number | 'gap';

export function pageWindow(page: number, pageCount: number, siblings = 1): PageWindowItem[] {
  if (pageCount < 1) return [];
  const current = Math.min(Math.max(1, page), pageCount);
  const from = Math.max(1, current - siblings);
  const to = Math.min(pageCount, current + siblings);
  const items: PageWindowItem[] = [];
  if (from > 1) {
    items.push(1);
    if (from === 3) items.push(2);
    else if (from > 3) items.push('gap');
  }
  for (let n = from; n <= to; n++) items.push(n);
  if (to < pageCount) {
    if (to === pageCount - 2) items.push(pageCount - 1);
    else if (to < pageCount - 2) items.push('gap');
    items.push(pageCount);
  }
  return items;
}
