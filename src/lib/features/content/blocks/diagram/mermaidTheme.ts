// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A diagram takes the content palette of its canvas (docs/architecture/theming.md,
// "Content scheme"). Mermaid derives shades from concrete colours, so it can't
// take `var()`: the palette is read off the rendered element.
import { parseColor, relativeLuminance } from '$lib/design-system/theme/color';

export const MERMAID_TOKENS = [
  '--content-bg',
  '--content-fg',
  '--content-muted',
  '--content-border',
  '--content-accent',
  '--content-accent-soft',
  '--content-raised',
  '--content-table-header',
  '--content-warning',
] as const;
type MermaidToken = (typeof MERMAID_TOKENS)[number];

/**
 * Mermaid measures each label in `fontFamily`, so it must be the font the
 * canvas renders: `inherit` would measure in another font and clip labels.
 */
export function mermaidThemeVariables(palette: Record<MermaidToken, string>, fontFamily: string): Record<string, string | boolean> {
  const bg = palette['--content-bg'];
  const fg = palette['--content-fg'];
  const border = palette['--content-border'];
  const ground = parseColor(bg);
  return {
    darkMode: ground ? relativeLuminance(ground) < 0.5 : false,
    background: bg,
    fontFamily,
    textColor: fg,
    titleColor: fg,
    lineColor: palette['--content-muted'],
    // Nodes: the accent's soft ground with an accent edge.
    primaryColor: palette['--content-accent-soft'],
    primaryTextColor: fg,
    primaryBorderColor: palette['--content-accent'],
    mainBkg: palette['--content-accent-soft'],
    nodeBorder: palette['--content-accent'],
    secondaryColor: palette['--content-table-header'],
    secondaryTextColor: fg,
    secondaryBorderColor: border,
    tertiaryColor: palette['--content-raised'],
    tertiaryTextColor: fg,
    tertiaryBorderColor: border,
    clusterBkg: palette['--content-table-header'],
    clusterBorder: border,
    edgeLabelBackground: bg,
    noteBkgColor: palette['--content-table-header'],
    noteTextColor: fg,
    noteBorderColor: border,
    // A diagram that fails to parse renders Mermaid's own error graphic.
    errorBkgColor: palette['--content-warning'],
    errorTextColor: palette['--content-warning'],
  };
}

/** Null when the element isn't laid out yet: a detached node has no computed custom properties. */
export function readContentPalette(el: Element): Record<MermaidToken, string> | null {
  if (!el.isConnected) return null;
  const style = getComputedStyle(el);
  const palette = {} as Record<MermaidToken, string>;
  for (const token of MERMAID_TOKENS) {
    const value = style.getPropertyValue(token).trim();
    if (!value) return null;
    palette[token] = value;
  }
  // The page's own background, when it sets one, is the diagram's ground.
  const ground = style.getPropertyValue('--page-bg').trim();
  if (ground) palette['--content-bg'] = ground;
  return palette;
}

export function mermaidConfigFor(el: Element): Record<string, unknown> {
  const palette = readContentPalette(el);
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    ...(palette ? { theme: 'base', themeVariables: mermaidThemeVariables(palette, getComputedStyle(el).fontFamily) } : { theme: 'default' }),
  };
}

/** Fired on window when a canvas changes scheme without a navigation. */
export const CONTENT_SCHEME_CHANGE_EVENT = 'content-scheme-change';
