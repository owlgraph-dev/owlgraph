// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';

// Measurements for the responsive guardrail (docs/architecture/responsive.md,
// src/lib/shell/e2e/responsive.spec.ts).

/**
 * Everything that runs past the viewport's sides. Three checks, each catching
 * what the others miss: the scrollers (an editor scrolls its own canvas), every
 * box, and every text run (a long word overflows its box without widening it).
 * What a box inside the viewport scrolls or clips is contained, not an overflow.
 */
export function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const problems: string[] = [];
    const pageScrollers = new Set<Element>([document.documentElement, document.body]);
    for (const sel of ['.editor-app', '.editor-scroll', '.m-editor-app', '.m-editor-scroll']) {
      document.querySelectorAll(sel).forEach((e) => pageScrollers.add(e));
    }
    const label = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter((c) => c && !c.startsWith('svelte-')).slice(0, 3).join('.') : '';
      const block = el.closest('[data-block-id]')?.getAttribute('data-block-id');
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${block ? ` in block ${block}` : ''}`;
    };
    const outside = (r: DOMRect) => r.right > vw + 1 || r.left < -1;
    const held = (from: Element | null) => {
      for (let a = from; a && a !== document.body; a = a.parentElement) {
        if (pageScrollers.has(a)) continue;
        if (getComputedStyle(a).overflowX === 'visible') continue;
        if (!outside(a.getBoundingClientRect())) return true;
      }
      return false;
    };

    // What reaches past a fixed shell scrolls nowhere.
    for (const el of pageScrollers) {
      const scrolls = el === document.documentElement || /(auto|scroll)/.test(getComputedStyle(el).overflowX);
      if (scrolls && el.scrollWidth > el.clientWidth + 1) problems.push(`${label(el)} scrolls sideways: ${el.scrollWidth}px of content in ${el.clientWidth}px`);
    }

    const reported = new Set<Element>();
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || !outside(r)) continue;
      // Placed wholly off-screen on purpose (a skip link, the diagram frame).
      if ((cs.position === 'absolute' || cs.position === 'fixed') && (r.right <= 0 || r.left >= vw)) continue;
      if (held(el.parentElement)) continue;
      // Only the outermost of a nest of overflowing boxes.
      if (el.parentElement && reported.has(el.parentElement)) { reported.add(el); continue; }
      reported.add(el);
      problems.push(`${label(el)} spans ${Math.round(r.left)}–${Math.round(r.right)}px of a ${vw}px viewport`);
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent?.trim();
      const el = t.parentElement;
      if (!text || !el || el.closest('svg, script, style, noscript')) continue;
      range.selectNodeContents(t);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || !outside(r) || held(el)) continue;
      if (reported.has(el)) continue;
      problems.push(`text "${text.slice(0, 40)}" (${label(el)}) spans ${Math.round(r.left)}–${Math.round(r.right)}px of a ${vw}px viewport`);
    }
    return problems;
  });
}

/**
 * Each layout container's arrangement and each image's aspect ratio under
 * `root`, by block id: identical in the editor and on the page, so the two
 * compare directly. Vertically overlapping cells share a line.
 */
export function layoutFingerprint(page: Page, root: string): Promise<Record<string, string>> {
  return page.evaluate((rootSelector) => {
    const out: Record<string, string> = {};
    const scope = document.querySelector(rootSelector);
    if (!scope) return out;
    for (const block of scope.querySelectorAll('[data-block-id]')) {
      const image = block.matches('.page-image-frame') ? block.querySelector('img.page-image') : null;
      if (image) {
        const r = image.getBoundingClientRect();
        out[block.getAttribute('data-block-id')!] = `image ${(r.width / r.height).toFixed(2)}`;
        continue;
      }
      const box = block.querySelector(':scope > .flex, :scope > .grid');
      if (!box) continue;
      const cs = getComputedStyle(box);
      const kind = box.classList.contains('page-section') ? 'section' : box.classList.contains('grid') ? 'grid' : 'flex';
      const shape = kind === 'flex' ? `${cs.flexDirection}/${cs.flexWrap}` : `${cs.gridTemplateColumns.split(' ').length} tracks`;
      const cells = [...box.children]
        .filter((c) => c.matches('.grid-cell, .flex-cell'))
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .sort((a, b) => a.top - b.top);
      const lines: number[] = [];
      let bottom = -Infinity;
      for (const r of cells) {
        if (r.top >= bottom - 1) { lines.push(1); bottom = r.bottom; }
        else { lines[lines.length - 1]++; bottom = Math.max(bottom, r.bottom); }
      }
      out[block.getAttribute('data-block-id')!] = `${kind} ${shape} ${lines.length}x${Math.max(0, ...lines)}`;
    }
    return out;
  }, root);
}

/**
 * Targets under 44 × 44 px and fields under 16 px text (docs/architecture/responsive.md,
 * "Touch"), for a `hasTouch` context. Exempt, as WCAG exempts them: a link in
 * a line of text, and SVG. An item filling its group's frame is measured with
 * the frame, a control inside a larger target with that target.
 */
export function touchTargets(page: Page, within = 'body'): Promise<string[]> {
  return page.evaluate((scope) => {
    const inScope = (el: Element) => !!el.closest(scope);
    const MIN = 43.5;
    const problems: string[] = [];
    const label = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter((c) => c && !c.startsWith('svelte-') && !c.startsWith('s-')).slice(0, 3).join('.') : '';
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${name}"`;
    };
    const shown = (el: Element) => {
      if (el.closest('[inert], [aria-hidden="true"], svg')) return null;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return null;
      return { r, cs };
    };
    // A focusable region (a tab panel, a dialog) is reached by keyboard, not tapped.
    const INTERACTIVE =
      'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=radio], [role=checkbox], [role=switch], [role=tab], [role=combobox], [role=slider], [role=treeitem], [tabindex]:not([tabindex="-1"]):not([role=tabpanel], [role=region], [role=dialog], [role=group], [role=document])';
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (!inScope(el)) continue;
      if ((el as HTMLElement).isContentEditable || el.matches('[contenteditable]')) continue;
      const s = shown(el);
      if (!s) continue;
      let { width, height } = s.r;
      if (el.tagName === 'A' && s.cs.display === 'inline') {
        const p = el.parentElement;
        if (p && [...p.childNodes].some((n) => n !== el && n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue;
      }
      const outer = el.parentElement?.closest(INTERACTIVE);
      if (outer && !el.matches('input, textarea, select')) {
        const o = outer.getBoundingClientRect();
        if (o.width >= MIN && o.height >= MIN) continue;
      }
      // A frame that adds only its border is the target.
      let frame = el.parentElement;
      while (frame && frame.getBoundingClientRect().height < height + 0.5) frame = frame.parentElement;
      if (frame) {
        const f = frame.getBoundingClientRect().height;
        if (f - height <= 2.5) height = f;
      }
      if (width < MIN || height < MIN) problems.push(`${label(el)} is ${Math.round(width)} × ${Math.round(height)} px`);
    }
    const FIELDS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=color]):not([type=range]), textarea, select, [role=combobox]';
    for (const el of document.querySelectorAll(FIELDS)) {
      if (!inScope(el)) continue;
      const s = shown(el);
      if (s && parseFloat(s.cs.fontSize) < 16) problems.push(`${label(el)} has ${s.cs.fontSize} text`);
    }
    return [...new Set(problems)];
  }, within);
}
