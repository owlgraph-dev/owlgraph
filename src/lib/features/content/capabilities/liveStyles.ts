// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page's `data-b` carrier (pageStyles.ts) kept live in the editor, for
// blocks drawn by a Svelte component. Ids are content-addressed, so editor and
// page name the same rule. A constructed stylesheet is CSSOM, outside the
// response's style-src, so it needs no nonce.
//
// A module registry, since a NodeView factory has no editor-scoped context:
// editorCore sets it before the editor is built (NodeViews are created while
// the content loads) and clears it on destroy.
import { StyleCollector, RULE_ID_ATTR } from './pageStyles';
import type { OverrideSet } from './overrides';

export class LiveStyles {
  readonly #collector = new StyleCollector();
  readonly #doc: Document;
  readonly #sheet: CSSStyleSheet | null;
  /** The fallback where constructed stylesheets are missing (jsdom). */
  readonly #element: HTMLStyleElement | null;
  #scheduled = false;
  #applied = '';

  constructor(doc: Document) {
    this.#doc = doc;
    if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in doc) {
      this.#sheet = new CSSStyleSheet();
      this.#element = null;
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, this.#sheet];
    } else {
      this.#sheet = null;
      this.#element = doc.createElement('style');
      doc.head.appendChild(this.#element);
    }
  }

  /** The rule id for a set — '' for an empty one; the sheet holds the rule before the next paint. */
  add(set: OverrideSet | null | undefined): string {
    const id = this.#collector.add(set);
    if (id) this.#schedule();
    return id;
  }

  /** Drops every rule no element under `root` names. Never call inside a transaction. */
  prune(root: ParentNode): void {
    const live = new Set<string>();
    for (const el of root.querySelectorAll(`[${RULE_ID_ATTR}]`)) live.add(el.getAttribute(RULE_ID_ATTR) ?? '');
    if (this.#collector.retain(live)) this.#schedule();
  }

  /** Writes the collector's rules into the sheet when they changed. */
  flush(): void {
    this.#scheduled = false;
    const css = this.#collector.css();
    if (css === this.#applied) return;
    this.#applied = css;
    if (this.#sheet) this.#sheet.replaceSync(css);
    else if (this.#element) this.#element.textContent = css;
  }

  dispose(): void {
    if (this.#sheet) this.#doc.adoptedStyleSheets = this.#doc.adoptedStyleSheets.filter((s) => s !== this.#sheet);
    this.#element?.remove();
  }

  #schedule(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => this.flush());
  }
}

let active: LiveStyles | null = null;

export function setLiveStyles(next: LiveStyles | null): void {
  active = next;
}

export function getLiveStyles(): LiveStyles | null {
  return active;
}
