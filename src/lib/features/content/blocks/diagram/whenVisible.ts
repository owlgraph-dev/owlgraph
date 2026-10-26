// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Mermaid lays out on the main thread, so drawing every diagram at once (on a
// scheme change) would freeze a page of them.
const MARGIN = '300px';

/** At once where the browser has no IntersectionObserver. */
export function whenVisible(el: HTMLElement, render: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    render();
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      render();
    },
    { rootMargin: MARGIN }
  );
  observer.observe(el);
  return () => observer.disconnect();
}
