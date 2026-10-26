// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Not Bits UI's lock: it restores the body with `setAttribute('style', …)`,
// which a strict style-src blocks, leaving the page unscrollable. The CSSOM is
// allowed. Reference-counted, so the last of nested layers releases it.
let locks = 0;
let previous: string | null = null;

/** Locks body scrolling; returns the release for this caller (idempotent). */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (locks++ === 0) {
    previous = document.body.style.getPropertyValue('overflow') || null;
    document.body.style.setProperty('overflow', 'hidden');
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks > 0) return;
    if (previous) document.body.style.setProperty('overflow', previous);
    else document.body.style.removeProperty('overflow');
    previous = null;
  };
}
