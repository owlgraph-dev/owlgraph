// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a custom style may do but will regret (docs/architecture/custom-styles.md): warnings,
// never refusals (docs/architecture/design-system/patterns.md, "Where an error goes").
import { contrastRatio, parseColor, type Rgba } from '$lib/design-system/theme/color';
import { resolveSchemeValue, SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
import postcss, { type Declaration } from 'postcss';
import valueParser from 'postcss-value-parser';
import type { StyleKind } from './compile';

/** Text needs 4.5:1 on its ground (docs/architecture/theming.md, "The schemes"). */
const TEXT_CONTRAST = 4.5;

/** The rule a declaration body is read inside, mirroring compileStyleCss's wrapper. */
const WRAPPER = 'a';

export type StyleWarning =
  | { kind: 'literal-color'; values: string[] }
  /** The style sets both colours, so the pair is the same on every page. */
  | { kind: 'contrast-pair'; background: string; text: string }
  /** The style sets only a background; the page's own text is what has to read on it. */
  | { kind: 'contrast-scheme'; background: string; schemes: SchemeName[] };

// Properties whose value is or carries a colour, shorthands included.
const COLOR_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'outline-color',
  'fill',
  'stroke',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'column-rule-color',
]);

// The named colours an admin reaches for; parseColor reads none.
const NAMED_COLORS = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
  'gray', 'grey', 'silver', 'gold', 'navy', 'teal', 'lime', 'cyan', 'magenta',
  'maroon', 'olive', 'aqua', 'fuchsia', 'indigo', 'violet', 'brown', 'beige',
]);

function isLiteralColorWord(word: string): boolean {
  return parseColor(word) !== null || NAMED_COLORS.has(word.toLowerCase());
}

/** The literal colours a declaration's value carries, in source order. */
function literalColorsIn(decl: Declaration): string[] {
  if (!COLOR_PROPERTIES.has(decl.prop.toLowerCase())) return [];
  const found: string[] = [];
  let parsed: valueParser.ParsedValue;
  try {
    parsed = valueParser(decl.value);
  } catch {
    return [];
  }
  parsed.walk((node) => {
    if (node.type === 'function') {
      const fn = node.value.toLowerCase();
      // var() is the whole point; don't look inside it for a fallback literal.
      if (fn === 'var') return false;
      if (fn === 'rgb' || fn === 'rgba') {
        found.push(valueParser.stringify(node));
        return false;
      }
      return true;
    }
    if (node.type === 'word' && isLiteralColorWord(node.value)) {
      found.push(node.value);
    }
    return true;
  });
  return found;
}

/** The last literal background colour a body sets, if any — the one that wins. */
function backgroundLiteral(decls: Declaration[]): Rgba | null {
  let latest: Rgba | null = null;
  for (const decl of decls) {
    const prop = decl.prop.toLowerCase();
    if (prop !== 'background' && prop !== 'background-color') continue;
    for (const raw of literalColorsIn(decl)) {
      const color = parseColor(raw);
      if (color) latest = color;
    }
  }
  return latest;
}

function textLiteral(decls: Declaration[]): Rgba | null {
  let latest: Rgba | null = null;
  for (const decl of decls) {
    if (decl.prop.toLowerCase() !== 'color') continue;
    const color = parseColor(decl.value.trim());
    if (color) latest = color;
  }
  return latest;
}

/**
 * A literal colour cannot follow the scheme; an inline style's literal
 * background is checked against its own text colour, or else both schemes'
 * page text. Nothing when the CSS does not parse: the compiler reports that.
 */
export function styleWarnings(css: string, kind: StyleKind): StyleWarning[] {
  if (css.trim() === '') return [];

  const decls: Declaration[] = [];
  try {
    const root = postcss.parse(`${WRAPPER}{${css}}`, { from: undefined });
    // compileStyleCss's wrapper guard: CSS it refuses collects no advice.
    const nodes = (root.nodes ?? []).filter((node) => node.type !== 'comment');
    if (nodes.length !== 1 || nodes[0].type !== 'rule' || nodes[0].selector !== WRAPPER) return [];
    root.walkDecls((decl) => {
      decls.push(decl);
    });
  } catch {
    return [];
  }

  const warnings: StyleWarning[] = [];

  const literals = decls.flatMap(literalColorsIn);
  if (literals.length > 0) warnings.push({ kind: 'literal-color', values: [...new Set(literals)] });

  const background = backgroundLiteral(decls);
  if (kind === 'inline' && background && background.a > 0) {
    const text = textLiteral(decls);
    if (text) {
      if (contrastRatio(text, background) < TEXT_CONTRAST) {
        warnings.push({ kind: 'contrast-pair', background: toDisplay(background), text: toDisplay(text) });
      }
    } else {
      const failing: SchemeName[] = [];
      for (const scheme of SCHEME_NAMES) {
        const pageText = parseColor(resolveSchemeValue(scheme, '--content-fg') ?? '');
        if (pageText && contrastRatio(pageText, background) < TEXT_CONTRAST) failing.push(scheme);
      }
      if (failing.length > 0) {
        warnings.push({ kind: 'contrast-scheme', background: toDisplay(background), schemes: failing });
      }
    }
  }

  return warnings;
}

function toDisplay(color: Rgba): string {
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}
