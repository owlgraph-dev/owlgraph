// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every custom property whose value depends on the colour scheme, one complete
// set per scheme, emitted by ./emit.ts (docs/architecture/theming.md lists the contrast
// bars). Never a partial block: a var() value is substituted where it is
// declared, so a derived token only on :root would keep its light value.

const light = {
  '--ds-color-bg': '#fbfbfa',
  '--ds-color-fg': '#1d1d1f',
  // 5.35:1 on bg, 5.0:1 on the well and accent-soft; the design-system a11y spec checks it.
  '--ds-color-muted': '#68686d',
  '--ds-color-border': '#e7e7e4',
  '--ds-color-accent': '#2563eb',
  '--ds-color-accent-soft': '#eef3ff',
  '--ds-color-link': '#2563eb',
  '--ds-color-danger': '#b42318',
  '--ds-color-danger-soft': '#fef3f2',
  // SettingsWell's preview ground, a step darker than the page.
  '--ds-color-well': '#f3f3f0',
  // Text on an accent or danger fill, and the ring colour those fills swap in.
  '--ds-color-on-accent': '#fff',
  // `strong` meets 3:1 on bg, for a boundary that alone carries a state (a
  // switch's off track).
  '--ds-color-border-hover': '#cfcfca',
  '--ds-color-border-strong': '#858581',
  // A thing to press or drag: a secondary button, a thumb, a toast.
  '--ds-color-raised': '#fff',
  // Modal and floating-layer grounds: the page's in light, where the shadow
  // carries elevation; a step lighter each in dark.
  '--ds-color-raised-modal': 'var(--ds-color-bg)',
  '--ds-color-raised-floating': 'var(--ds-color-bg)',
  '--ds-color-border-elevated': 'var(--ds-color-border)',
  // Each tone is text on its soft ground at 5.2–5.4:1.
  '--ds-color-info': '#0e7490',
  '--ds-color-info-soft': '#ecfeff',
  '--ds-color-warning': '#b54708',
  '--ds-color-warning-soft': '#fffaeb',
  '--ds-color-success': '#067647',
  '--ds-color-success-soft': '#ecfdf3',
  // The editor's property pill: violet, so a page fact never reads as a notice.
  '--ds-color-property': '#6d28d9',
  '--ds-color-property-soft': '#f3e8ff',
  '--ds-color-scrim': 'rgba(0, 0, 0, 0.25)',
  // The inner band of the editor's selected-block outline, the accent border's
  // opposite tone, so one of the two reads on any block.
  '--ds-color-indicator-companion': '#fff',

  // A filled control's hover mixes toward this (darkens in light); a quiet one
  // lays the neutral fill, which is also every list's highlight.
  '--ds-color-mix-target': '#000',
  // Not the full border tone: muted text on a highlighted item stays above 4.5:1.
  '--ds-color-fill-hover': 'color-mix(in srgb, var(--ds-color-border) 75%, var(--ds-color-bg))',
  '--ds-color-fill-pressed': 'var(--ds-color-border-hover)',
  // For a surface whose colour is content (a swatch, a graph node), which no
  // token fill can replace.
  '--ds-filter-content-hover': 'brightness(0.93)',
  '--ds-filter-content-pressed': 'brightness(0.85)',

  '--ds-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.08)',
  '--ds-shadow-md': '0 4px 20px rgba(0, 0, 0, 0.08)',
  '--ds-shadow-lg': '0 12px 40px rgba(0, 0, 0, 0.12)',

  // The graph view's categorical hues, validated as a set against each scheme's
  // page ground by the dataviz palette validator: re-validate both on any change.
  '--ds-viz-1': '#2a78d6',
  '--ds-viz-2': '#eb6834',
  '--ds-viz-3': '#1baf7a',
  '--ds-viz-4': '#eda100',
  '--ds-viz-5': '#e87ba4',
  '--ds-viz-6': '#008300',
  '--ds-viz-7': '#4a3aa7',
  '--ds-viz-8': '#e34948',
  '--ds-viz-other': '#898781',
  '--ds-viz-document': '#4338ca',

  // Page content's own values. `filled-fg` is read inside a filled card's
  // scheme region; the code block stays dark, as app.css's highlighting expects.
  '--content-bg': '#fff',
  '--content-raised': '#fff',
  '--content-table-header': '#f6f6f4',
  '--content-filled-fg': '#1d1d1f',
  '--content-code-bg': '#f1f1ee',
  '--content-pre-bg': '#0f1115',
  '--content-pre-fg': '#e6e6e6',
  '--content-doc-link': '#4338ca',
  '--content-warning-border': '#f0c8a0',

  // Which site logo shows: not a colour, but it follows the scheme like one.
  '--ds-logo-light-display': 'block',
  '--ds-logo-dark-display': 'none',
} as const satisfies Record<`--${string}`, string>;

type BaseTokenName = keyof typeof light;

// Not an inversion: the same roles stepped for a dark ground. Elevation climbs
// by lightness, and hover moves toward white.
const dark: Record<BaseTokenName, string> = {
  '--ds-color-bg': '#171716',
  '--ds-color-fg': '#ecebe8',
  '--ds-color-muted': '#a3a29d',
  '--ds-color-border': '#2f2f2c',
  '--ds-color-accent': '#7aabff',
  '--ds-color-accent-soft': '#1c2a42',
  '--ds-color-link': '#7aabff',
  '--ds-color-danger': '#ff8b7e',
  '--ds-color-danger-soft': '#3a1b18',
  '--ds-color-well': '#111110',
  '--ds-color-on-accent': '#0c1424',
  '--ds-color-border-hover': '#403f3b',
  '--ds-color-border-strong': '#7a7974',
  '--ds-color-raised': '#252523',
  '--ds-color-raised-modal': '#1e1e1c',
  '--ds-color-raised-floating': '#282826',
  '--ds-color-border-elevated': '#3a3a36',
  '--ds-color-info': '#5fc6d8',
  '--ds-color-info-soft': '#0f2b31',
  '--ds-color-warning': '#f2a562',
  '--ds-color-warning-soft': '#33250f',
  '--ds-color-success': '#5ccb93',
  '--ds-color-success-soft': '#10291d',
  '--ds-color-property': '#b9a0ff',
  '--ds-color-property-soft': '#2a1f45',
  '--ds-color-scrim': 'rgba(0, 0, 0, 0.6)',
  '--ds-color-indicator-companion': '#111110',

  '--ds-color-mix-target': '#fff',
  '--ds-color-fill-hover': '#383835',
  '--ds-color-fill-pressed': '#464541',
  '--ds-filter-content-hover': 'brightness(1.15)',
  '--ds-filter-content-pressed': 'brightness(1.3)',

  // Deeper and tighter: a soft, wide shadow disappears on a dark ground.
  '--ds-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.5)',
  '--ds-shadow-md': '0 4px 16px rgba(0, 0, 0, 0.45)',
  '--ds-shadow-lg': '0 12px 32px rgba(0, 0, 0, 0.55)',

  '--ds-viz-1': '#3987e5',
  '--ds-viz-2': '#d95926',
  '--ds-viz-3': '#199e70',
  '--ds-viz-4': '#c98500',
  '--ds-viz-5': '#d55181',
  '--ds-viz-6': '#008300',
  '--ds-viz-7': '#9085e9',
  '--ds-viz-8': '#e66767',
  '--ds-viz-other': '#898781',
  '--ds-viz-document': '#9085e9',

  '--content-bg': '#1c1c1b',
  '--content-raised': '#1c1c1b',
  '--content-table-header': '#282826',
  '--content-filled-fg': '#fff',
  '--content-code-bg': '#2c2c2a',
  '--content-pre-bg': '#0f1115',
  '--content-pre-fg': '#e6e6e6',
  '--content-doc-link': '#aaa5ff',
  '--content-warning-border': '#5c3f1e',

  '--ds-logo-light-display': 'none',
  '--ds-logo-dark-display': 'block',
};

// The same expression in every scheme.
const derived = {
  '--ds-color-accent-hover': 'color-mix(in srgb, var(--ds-color-accent) 88%, var(--ds-color-mix-target))',
  '--ds-color-accent-pressed': 'color-mix(in srgb, var(--ds-color-accent) 76%, var(--ds-color-mix-target))',
  '--ds-color-danger-hover': 'color-mix(in srgb, var(--ds-color-danger) 88%, var(--ds-color-mix-target))',
  '--ds-color-danger-pressed': 'color-mix(in srgb, var(--ds-color-danger) 76%, var(--ds-color-mix-target))',
  '--ds-color-accent-soft-pressed': 'color-mix(in srgb, var(--ds-color-accent) 16%, var(--ds-color-accent-soft))',
  '--ds-color-danger-soft-pressed': 'color-mix(in srgb, var(--ds-color-danger) 12%, var(--ds-color-danger-soft))',
  '--ds-color-border-strong-hover': 'color-mix(in srgb, var(--ds-color-border-strong) 85%, var(--ds-color-mix-target))',
  '--ds-color-border-strong-pressed': 'color-mix(in srgb, var(--ds-color-border-strong) 70%, var(--ds-color-mix-target))',

  // The page's values under a second name, never overridden by a band: a
  // floating layer rendered inside a branded band (the nav submenu) takes these back.
  '--ds-page-fg': 'var(--ds-color-fg)',
  '--ds-page-muted': 'var(--ds-color-muted)',
  '--ds-page-accent': 'var(--ds-color-accent)',
  '--ds-page-accent-soft': 'var(--ds-color-accent-soft)',
  '--ds-page-accent-soft-pressed': 'var(--ds-color-accent-soft-pressed)',
  '--ds-page-on-accent': 'var(--ds-color-on-accent)',
  '--ds-page-border': 'var(--ds-color-border)',
  '--ds-page-fill-hover': 'var(--ds-color-fill-hover)',
  '--ds-page-fill-pressed': 'var(--ds-color-fill-pressed)',

  // The app bar's roles, which siteTheme.ts overrides for a branded bar. It
  // restates the interaction steps too: a page-derived fill smears on a brand colour.
  '--ds-appbar-bg': 'var(--ds-color-bg)',
  '--ds-appbar-fg': 'var(--ds-color-fg)',
  '--ds-appbar-muted': 'var(--ds-color-muted)',
  '--ds-appbar-accent': 'var(--ds-color-accent)',
  '--ds-appbar-accent-soft': 'var(--ds-color-accent-soft)',
  '--ds-appbar-on-accent': 'var(--ds-color-on-accent)',
  '--ds-appbar-border': 'var(--ds-color-border)',
  '--ds-appbar-fill-hover': 'var(--ds-color-fill-hover)',
  '--ds-appbar-fill-pressed': 'var(--ds-color-fill-pressed)',
  '--ds-appbar-logo-light-display': 'var(--ds-logo-light-display)',
  '--ds-appbar-logo-dark-display': 'var(--ds-logo-dark-display)',

  // The footer's roles, which siteTheme.ts overrides for a branded footer.
  '--ds-footer-bg': 'var(--ds-color-bg)',
  '--ds-footer-fg': 'var(--ds-color-fg)',
  '--ds-footer-muted': 'var(--ds-color-muted)',
  '--ds-footer-accent': 'var(--ds-color-accent)',
  '--ds-footer-border': 'var(--ds-color-border)',

  // The focus ring's colour parts (docs/architecture/design-system/tokens.md, "Focus and selection rings").
  '--ds-focus-ring-color': 'var(--ds-color-accent)',
  // For the few primitives that must restate the ring.
  '--ds-focus-ring': 'var(--ds-focus-ring-width) solid var(--ds-focus-ring-color)',
  // For a ground no single colour contrasts with (a swatch): with a
  // --ds-color-fg ring, one of the two tones reaches 3:1.
  '--ds-focus-ring-companion': 'inset 0 0 0 calc(var(--ds-focus-ring-width) + 1px) var(--ds-color-bg)',

  // Authored pages' palette, never read by chrome. Its own layer, so a pinned
  // content scheme or a site theme can set it apart from the shell.
  '--content-fg': 'var(--ds-color-fg)',
  '--content-muted': 'var(--ds-color-muted)',
  '--content-border': 'var(--ds-color-border)',
  '--content-link': 'var(--ds-color-link)',
  '--content-accent': 'var(--ds-color-accent)',
  '--content-accent-soft': 'var(--ds-color-accent-soft)',
  // For derived content colours (a filled card's hover, a tinted table header).
  '--content-mix-target': 'var(--ds-color-mix-target)',
  '--content-warning': 'var(--ds-color-warning)',
  '--content-warning-soft': 'var(--ds-color-warning-soft)',
  '--content-success': 'var(--ds-color-success)',
  '--content-success-soft': 'var(--ds-color-success-soft)',
  '--content-danger': 'var(--ds-color-danger)',
  '--content-danger-soft': 'var(--ds-color-danger-soft)',
  // Theme colours an author references as `token:<name>`
  // (features/content/color/colorTokens.ts); inverse is the text colour as a ground.
  '--content-theme-text': 'var(--content-fg)',
  '--content-theme-muted': 'var(--content-muted)',
  '--content-theme-border': 'var(--content-border)',
  '--content-theme-border-strong': 'var(--ds-color-border-strong)',
  '--content-theme-background': 'var(--content-bg)',
  '--content-theme-subtle': 'var(--content-table-header)',
  '--content-theme-accent': 'var(--content-accent)',
  '--content-theme-accent-soft': 'var(--content-accent-soft)',
  '--content-theme-on-accent': 'var(--ds-color-on-accent)',
  '--content-theme-inverse': 'var(--content-fg)',
  '--content-theme-on-inverse': 'var(--content-bg)',
  '--content-theme-info': 'var(--ds-color-info)',
  '--content-theme-info-soft': 'var(--ds-color-info-soft)',
  '--content-theme-success': 'var(--content-success)',
  '--content-theme-success-soft': 'var(--content-success-soft)',
  '--content-theme-warning': 'var(--content-warning)',
  '--content-theme-warning-soft': 'var(--content-warning-soft)',
  '--content-theme-danger': 'var(--content-danger)',
  '--content-theme-danger-soft': 'var(--content-danger-soft)',
  // The Surface capability's shadow presets (SHADOW_PRESETS).
  '--content-shadow-sm': 'var(--ds-shadow-sm)',
  '--content-shadow-md': 'var(--ds-shadow-md)',
  '--content-shadow-lg': 'var(--ds-shadow-lg)',
} as const satisfies Record<`--${string}`, string>;

export type SchemeTokenName = BaseTokenName | keyof typeof derived;
export type SchemeTokens = Readonly<Record<SchemeTokenName, string>>;

export const SCHEME_NAMES = ['light', 'dark'] as const;
export type SchemeName = (typeof SCHEME_NAMES)[number];

export const DEFAULT_SCHEMES: Readonly<Record<SchemeName, SchemeTokens>> = {
  light: { ...light, ...derived },
  dark: { ...dark, ...derived },
};

/** A resolved set per scheme: the built-in tokens, plus whatever a theme adds (brand colours). */
export type SchemeSets = Readonly<Record<SchemeName, Readonly<Record<string, string>>>>;

// The built-ins until siteTheme.ts's setActiveTheme sets the site's. One site,
// one theme, so a module value serves every request.
let activeSets: SchemeSets = DEFAULT_SCHEMES;

export function setActiveSchemes(sets: SchemeSets): void {
  activeSets = sets;
}

/**
 * A token's concrete value through its `var()` aliases; null for an unknown
 * property or a value that is not a plain alias chain.
 */
export function resolveSchemeValue(scheme: SchemeName, property: string, sets: SchemeSets = activeSets): string | null {
  let value: string | undefined = sets[scheme][property];
  for (let depth = 0; value && depth < 8; depth++) {
    const alias: RegExpMatchArray | null = value.match(/^var\((--[\w-]+)\)$/);
    if (!alias) return value;
    value = sets[scheme][alias[1]];
  }
  return null;
}
