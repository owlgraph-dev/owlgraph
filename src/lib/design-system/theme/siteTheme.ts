// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site theme (docs/architecture/theming.md, "Site theme"): an admin's brand, stored
// sparse and resolved over the built-in schemes. A brand colour becomes
// `--content-brand-<id>` plus `-fg`, referenced as `token:brand.<id>`. Pure, so
// the server and the browser emit identical CSS.
import { contrastRatio, fromOklch, mixSrgb, parseColor, toHex, toOklch, type Rgba } from './color';
import { emitSchemeCss } from './emit';
import { LAYER_ORDER, inLayer } from '$lib/platform/cssLayers';
import { readableScheme } from './readableScheme';
import { DEFAULT_SCHEMES, SCHEME_NAMES, resolveSchemeValue, setActiveSchemes, type SchemeName, type SchemeSets } from './tokens';
import type { StoredBlockDefaults } from '$lib/features/content';

export interface BrandColor {
  /** Stable: content references it, so renaming never breaks a page. */
  id: string;
  name: string;
  light: string;
  dark: string;
}

export interface StoredTheme {
  version: 1;
  /** The brand accent both schemes' accents are generated from; null keeps the built-in accent. */
  accent?: string | null;
  /** A scheme's accent set by hand, instead of generated. */
  schemes?: Partial<Record<SchemeName, { accent?: string | null }>>;
  brand?: BrandColor[];
  /** The app bar's background, per scheme; an unset scheme keeps the plain bar. */
  appbar?: Partial<Record<SchemeName, string | null>>;
  /** The footer's background, per scheme; an unset scheme keeps the plain footer. */
  footer?: Partial<Record<SchemeName, string | null>>;
  /** The logo shown in the dark scheme (an asset of kind `logo`); null shows the one logo everywhere. */
  logoDarkAssetId?: string | null;
  /** The capability defaults, sparse; features/content resolves and emits them. */
  blockDefaults?: StoredBlockDefaults;
}

export const EMPTY_THEME: StoredTheme = { version: 1 };

/** A brand colour id: lowercase letters and digits — it becomes part of a custom property name. */
export const BRAND_ID = /^[a-z0-9]{1,24}$/;
/** An accent or brand colour value: an opaque `#rrggbb`. */
export const THEME_COLOR = /^#[0-9a-f]{6}$/i;

export function brandProperty(id: string): string {
  return `--content-brand-${id}`;
}

/** How well the text a brand colour pairs with reads on it, in a scheme (4.5:1 is the bar). */
export function brandTextRatio(scheme: SchemeName, value: string): number | null {
  const ground = parseColor(value);
  if (!ground) return null;
  const text = parseColor(resolveSchemeValue(scheme, '--content-fg', DEFAULT_SCHEMES)!)!;
  const page = parseColor(resolveSchemeValue(scheme, '--content-bg', DEFAULT_SCHEMES)!)!;
  return Math.max(contrastRatio(text, ground), contrastRatio(page, ground));
}

/** Whichever of a scheme's chrome text and page ground reads better on a colour. */
function readableOnGround(scheme: SchemeName, ground: Rgba, sets = DEFAULT_SCHEMES): Rgba {
  const text = parseColor(resolveSchemeValue(scheme, '--ds-color-fg', sets)!)!;
  const page = parseColor(resolveSchemeValue(scheme, '--ds-color-bg', sets)!)!;
  return contrastRatio(text, ground) >= contrastRatio(page, ground) ? text : page;
}

export interface Shortfall {
  /** `foreground on ground`, token names without the prefix. */
  pair: string;
  ratio: number;
  minimum: number;
}

// A token's colour in a set, evaluating var() aliases and the one color-mix
// form the tokens use (`color-mix(in srgb, A P%, B)`).
function evaluate(set: Readonly<Record<string, string>>, value: string, depth = 0): Rgba | null {
  if (depth > 10) return null;
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) return set[alias[1]] ? evaluate(set, set[alias[1]], depth + 1) : null;
  const mix = value.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/);
  if (mix) {
    const a = evaluate(set, mix[1], depth + 1);
    const b = evaluate(set, mix[3], depth + 1);
    return a && b ? mixSrgb(a, b, Number(mix[2]) / 100) : null;
  }
  return parseColor(value);
}

// Not the list highlight: a highlighted item's text is fg and muted, and the
// built-in light accent misses the bar there (4.37:1).
const ACCENT_TEXT_GROUNDS = ['bg', 'surface', 'surface-modal', 'surface-overlay', 'well', 'accent-soft'];

/** What an accent and its soft tint miss in a scheme; every pair needs 4.5:1, which covers the ring's 3:1. */
export function accentShortfalls(scheme: SchemeName, accent: string, soft: string): Shortfall[] {
  const set = { ...DEFAULT_SCHEMES[scheme], '--ds-color-accent': accent, '--ds-color-accent-soft': soft } as Record<string, string>;
  const color = (name: string) => evaluate(set, set[`--ds-color-${name}`] ?? '');
  const out: Shortfall[] = [];
  const check = (fg: string, ground: string) => {
    const a = color(fg);
    const b = color(ground);
    if (!a || !b) return;
    const ratio = contrastRatio(a, b);
    if (ratio < 4.5) out.push({ pair: `${fg} on ${ground}`, ratio, minimum: 4.5 });
  };
  for (const ground of ACCENT_TEXT_GROUNDS) check('accent', ground);
  check('fg', 'accent-soft');
  check('muted', 'accent-soft');
  for (const fill of ['accent', 'accent-hover', 'accent-pressed']) check('on-accent', fill);
  return out;
}

// The soft tint of an accent: a near-page lightness of its hue, lightened (in
// light) or darkened (in dark) further until text reads on it.
function softFor(scheme: SchemeName, accent: string): string {
  const { c, h } = toOklch(parseColor(accent)!);
  const chroma = Math.min(scheme === 'light' ? 0.03 : 0.05, c * (scheme === 'light' ? 0.3 : 0.4));
  const start = scheme === 'light' ? 0.965 : 0.28;
  const step = scheme === 'light' ? 0.005 : -0.005;
  let soft = toHex(fromOklch({ l: start, c: chroma, h }));
  for (let l = start; scheme === 'light' ? l <= 1 : l >= 0.12; l += step) {
    soft = toHex(fromOklch({ l, c: chroma, h }));
    const fails = accentShortfalls(scheme, accent, soft).filter((s) => s.pair.endsWith('on accent-soft') && !s.pair.startsWith('accent'));
    if (!fails.length) break;
  }
  return soft;
}

export interface SchemeAccent {
  accent: string;
  soft: string;
  source: 'default' | 'generated' | 'override';
}

/**
 * The brand colour itself when it meets the bars, else the nearest lightness of
 * its hue and chroma that does; null when none does.
 */
export function generateAccent(scheme: SchemeName, brand: string): { accent: string; soft: string } | null {
  const base = parseColor(brand);
  if (!base) return null;
  const passes = (accent: string) => {
    const soft = softFor(scheme, accent);
    return accentShortfalls(scheme, accent, soft).length ? null : { accent, soft };
  };
  const exact = passes(toHex(base));
  if (exact) return exact;
  const { l, c, h } = toOklch(base);
  for (let delta = 0.005; delta <= 1; delta += 0.005) {
    for (const candidate of [l - delta, l + delta]) {
      if (candidate < 0 || candidate > 1) continue;
      const found = passes(toHex(fromOklch({ l: candidate, c, h })));
      if (found) return found;
    }
  }
  return null;
}

/** A scheme's accent under a stored theme, and where it came from. */
export function schemeAccent(theme: StoredTheme, scheme: SchemeName): SchemeAccent {
  const override = theme.schemes?.[scheme]?.accent;
  if (override && parseColor(override)) return { accent: override.toLowerCase(), soft: softFor(scheme, override), source: 'override' };
  const generated = theme.accent ? generateAccent(scheme, theme.accent) : null;
  if (generated) return { ...generated, source: 'generated' };
  const defaults = DEFAULT_SCHEMES[scheme];
  return { accent: defaults['--ds-color-accent'], soft: defaults['--ds-color-accent-soft'], source: 'default' };
}

/** The complete sets a stored theme gives: the built-in schemes with its accent and brand colours. */
export function resolveTheme(theme: StoredTheme): SchemeSets {
  const sets = {} as Record<SchemeName, Record<string, string>>;
  for (const scheme of SCHEME_NAMES) {
    const set: Record<string, string> = { ...DEFAULT_SCHEMES[scheme] };
    const { accent, soft } = schemeAccent(theme, scheme);
    set['--ds-color-accent'] = accent;
    set['--ds-color-accent-soft'] = soft;
    set['--ds-color-link'] = accent;
    // The bar holds controls, so its set covers the interaction steps too, all
    // from the bar's text: the site accent isn't checked against an arbitrary ground.
    const appbar = parseColor(theme.appbar?.[scheme] ?? '');
    if (appbar) {
      const barText = readableOnGround(scheme, appbar);
      const step = (weight: number) => toHex(mixSrgb(barText, appbar, weight));
      set['--ds-appbar-bg'] = toHex(appbar);
      set['--ds-appbar-fg'] = toHex(barText);
      set['--ds-appbar-muted'] = toHex(barText);
      set['--ds-appbar-accent'] = toHex(barText);
      set['--ds-appbar-accent-soft'] = step(0.16);
      set['--ds-appbar-on-accent'] = toHex(appbar);
      set['--ds-appbar-border'] = step(0.16);
      set['--ds-appbar-fill-hover'] = step(0.1);
      set['--ds-appbar-fill-pressed'] = step(0.18);
      const barScheme = readableScheme(appbar, '--ds-color-fg').scheme;
      set['--ds-appbar-logo-light-display'] = barScheme === 'light' ? 'block' : 'none';
      set['--ds-appbar-logo-dark-display'] = barScheme === 'dark' ? 'block' : 'none';
    }

    // The text that reads on the footer carries every text role there, for the
    // same reason.
    const footer = parseColor(theme.footer?.[scheme] ?? '');
    if (footer) {
      const footerText = toHex(readableOnGround(scheme, footer));
      set['--ds-footer-bg'] = toHex(footer);
      set['--ds-footer-fg'] = footerText;
      set['--ds-footer-muted'] = footerText;
      set['--ds-footer-accent'] = footerText;
      set['--ds-footer-border'] = toHex(mixSrgb(parseColor(footerText)!, footer, 0.16));
    }
    const text = parseColor(resolveSchemeValue(scheme, '--content-fg', DEFAULT_SCHEMES)!)!;
    const ground = parseColor(resolveSchemeValue(scheme, '--content-bg', DEFAULT_SCHEMES)!)!;
    for (const color of theme.brand ?? []) {
      const value = parseColor(color[scheme]);
      if (!BRAND_ID.test(color.id) || !value) continue;
      set[brandProperty(color.id)] = toHex(value);
      set[`${brandProperty(color.id)}-fg`] = toHex(contrastRatio(text, value) >= contrastRatio(ground, value) ? text : ground);
    }
    sets[scheme] = set;
  }
  return sets;
}

const cache = new Map<string, { sets: SchemeSets; css: string }>();

/** Cached by `version` (the theme row's updated_at), else by the stored JSON. */
export function compileTheme(theme: StoredTheme | null, version: string | null): { sets: SchemeSets; css: string } {
  const stored = theme ?? EMPTY_THEME;
  const key = version ?? JSON.stringify(stored);
  let compiled = cache.get(key);
  if (!compiled) {
    const sets = resolveTheme(stored);
    // Led by the order statement: the head's first stylesheet fixes the layer
    // order (platform/cssLayers.ts).
    compiled = { sets, css: LAYER_ORDER + inLayer('theme', emitSchemeCss(sets)) };
    // Old versions are never asked for again once a newer one is served.
    if (cache.size > 8) cache.clear();
    cache.set(key, compiled);
  }
  return compiled;
}

/** Makes a compiled theme the one colour reasoning resolves against (tokens.ts setActiveSchemes). */
export function setActiveTheme(compiled: { sets: SchemeSets }): void {
  setActiveSchemes(compiled.sets);
}
