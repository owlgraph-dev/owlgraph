// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The capability defaults as CSS, in the theme stylesheet (docs/architecture/theming.md).
// Each group's rule on `grp-<group>` (catalog.ts's groupClass) sets the
// `--default-*` properties app.css's chains bottom out in; they are registered
// inherits:false, so a card in a container gets the cards' defaults.
//
// A group's rhythm goes on the containers themselves, never the cells (which
// relay), and resets tablet and phone so it never mixes with an ancestor's
// tiers. Widths and gutters are re-declared on `:root` only when moved.
import { BLOCK_GROUPS } from '../../blocks/catalog';
import { colorCss, fillTextProperty } from '../../color/colorTokens';
import { TIERS } from '../cascade';
import { SHADOW_PRESETS } from '../surface/surface';
import { BUILTIN_GUTTERS, BUILTIN_WIDTHS, gutterTierProperty, stepProperty, WIDTH_TOKENS, widthProperty } from './tokens';
import type { ResolvedBlockDefaults, ResolvedGroupDefaults } from './blockDefaults';

// The text lands inside a <style> element via {@html}: a value that could
// close the declaration, the rule or the element is rejected.
const UNSAFE_VALUE = /[;{}<>]/;

function rule(selector: string, declarations: [name: string, value: string][]): string {
  if (declarations.length === 0) return '';
  let body = '';
  for (const [name, value] of declarations) {
    if (UNSAFE_VALUE.test(value)) throw new Error(`Unsafe default ${name}: ${value}`);
    body += `${name}:${value};`;
  }
  return `${selector}{${body}}`;
}

function groupDeclarations(group: ResolvedGroupDefaults): [string, string][] {
  const out: [string, string][] = [];
  if (group.pad != null) out.push(['--default-pad', `var(${stepProperty('pad', group.pad)})`]);
  if (group.radius != null) out.push(['--default-radius', `var(${stepProperty('radius', group.radius)})`]);
  if (group.shadow != null && group.shadow !== 'none') out.push(['--default-shadow', SHADOW_PRESETS[group.shadow]]);
  if (group.border != null) out.push(['--default-border', `1px solid ${colorCss(group.border)}`]);
  if (group.bg != null) {
    out.push(['--default-bg', colorCss(group.bg)]);
    // A theme colour's readable partner, as an authored background sets it (surfaceVars).
    out.push(['--default-fg', `var(${fillTextProperty(group.bg, 'block')})`]);
  }
  return out;
}

export function emitBlockDefaultsCss(resolved: ResolvedBlockDefaults): string {
  const rhythm = `var(${stepProperty('rhythm', resolved.page.blockSpace)})`;
  let css = rule(':root', [
    ...WIDTH_TOKENS.filter((w) => resolved.page.widths[w] !== BUILTIN_WIDTHS[w]).map((w): [string, string] => [widthProperty(w), `${resolved.page.widths[w]}px`]),
    ...TIERS.filter((t) => resolved.page.gutters[t] !== BUILTIN_GUTTERS[t]).map((t): [string, string] => [
      gutterTierProperty(t),
      `var(${stepProperty('gutter', resolved.page.gutters[t])})`,
    ]),
  ]);
  css += rule('.page-canvas', [
    ['--flow-space-d', rhythm],
    ['--block-space-d', rhythm],
  ]);
  for (const name of BLOCK_GROUPS) {
    const group = resolved.groups[name];
    css += rule(`.canvas-blocks .grp-${name}`, groupDeclarations(group));
    if (group.blockSpace != null) {
      css += rule(`.canvas-blocks .grp-${name}[data-block-id]`, [
        ['--flow-space-d', `var(${stepProperty('rhythm', group.blockSpace)})`],
        ['--flow-space-t', 'initial'],
        ['--flow-space-p', 'initial'],
      ]);
    }
  }
  return css;
}
