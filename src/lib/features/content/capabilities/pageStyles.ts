// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The per-page stylesheet carrier (docs/architecture/blocks/capabilities.md, "Override sets and the
// carrier"). A strict `style-src` (platform/csp.ts) blocks `style` attributes,
// so each set becomes a rule in one nonce'd <style>, selected by `data-b`:
//
//   <p data-b="b1k7x2z">…</p>          [data-b="b1k7x2z"]{--pad-d:24px}
//
// Ids are content-addressed, so equal sets share a rule and renders are
// reproducible. One collector per render pass, through the RenderContext:
// never module state, since the server renders concurrent requests. Its rules
// are unlayered (platform/cssLayers.ts), so they beat every layered stylesheet.
import type { OverrideSet } from './overrides';

/** The attribute a per-page rule selects on. */
export const RULE_ID_ATTR = 'data-b';

// A declaration lands inside a <style> element: a value may not close the
// declaration, the rule or the element, open a comment, or escape to any of
// those. The last line of defence; emitters and the sanitizer validate first.
const PROPERTY = /^(?:--)?-?[A-Za-z_][\w-]*$/;
const UNSAFE_VALUE = /[;{}<>\\]|\/\*/;
const SELECTOR = /^[-\w\s.#[\]="':,>+~*()]+$/;

/** The set as `property:value` declarations sorted by property, unsafe entries dropped; [] for nothing. */
function declarationsOf(set: OverrideSet | null | undefined): string[] {
  if (!set) return [];
  const entries = Object.entries(set).filter(
    ([property, value]) => PROPERTY.test(property) && typeof value === 'string' && value !== '' && !UNSAFE_VALUE.test(value)
  );
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([property, value]) => `${property}:${value}`);
}

/** FNV-1a over the declaration text, base36 — six or seven characters, letter-led. */
function hashId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `b${h.toString(36)}`;
}

export class StyleCollector {
  /** id → declaration text, in first-seen order (the order the rules are emitted in). */
  readonly #rules = new Map<string, string>();
  readonly #ids = new Map<string, string>();
  /** Rules on a selector of the caller's (the page canvas, the shell's logo), deduplicated by text. */
  readonly #selectorRules = new Set<string>();

  /** The id the set's element must carry as `data-b`; '' when the set holds nothing. */
  add(set: OverrideSet | null | undefined): string {
    const declarations = declarationsOf(set);
    if (declarations.length === 0) return '';
    const text = declarations.join(';');
    const known = this.#ids.get(text);
    if (known) return known;
    // A different set may hash to the same id; suffixing keeps the result a
    // function of insertion order alone, so a render stays reproducible.
    let id = hashId(text);
    for (let n = 2; this.#rules.has(id); n++) id = `${hashId(text)}-${n}`;
    this.#rules.set(id, text);
    this.#ids.set(text, id);
    return id;
  }

  /** A rule on `selector` for callers that own their element's selector (no `data-b` involved). */
  addRule(selector: string, set: OverrideSet | null | undefined): void {
    const declarations = declarationsOf(set);
    const sel = selector.trim();
    if (declarations.length === 0 || !sel || !SELECTOR.test(sel)) return;
    this.#selectorRules.add(`${sel}{${declarations.join(';')}}`);
  }

  /** Keeps only the rules whose id is in `ids`; true when something went. */
  retain(ids: ReadonlySet<string>): boolean {
    let changed = false;
    for (const [id, text] of this.#rules) {
      if (ids.has(id)) continue;
      this.#rules.delete(id);
      this.#ids.delete(text);
      changed = true;
    }
    return changed;
  }

  get isEmpty(): boolean {
    return this.#rules.size === 0 && this.#selectorRules.size === 0;
  }

  /** The stylesheet text: selector rules first, then one rule per registered set. Unlayered by design. */
  css(): string {
    let css = '';
    for (const rule of this.#selectorRules) css += rule;
    for (const [id, text] of this.#rules) css += `[${RULE_ID_ATTR}="${id}"]{${text}}`;
    return css;
  }
}

/** ` data-b="…"` for a set, or '' for an empty one — the public renderer's carrier step. */
export function ruleIdAttribute(styles: StyleCollector, set: OverrideSet | null | undefined): string {
  const id = styles.add(set);
  return id ? ` ${RULE_ID_ATTR}="${id}"` : '';
}
