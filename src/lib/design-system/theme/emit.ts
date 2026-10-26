// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The scheme token sets as one stylesheet, injected at SSR so the tokens exist
// before first paint (docs/architecture/theming.md). A preference selector outranks the bare
// :root; a pinned subtree (data-scheme, or -d/-t/-p per tier in exclusive
// canvas widths) declares its own set, which wins by inheritance.
import { DEFAULT_SCHEMES, type SchemeName, type SchemeSets } from './tokens';

const LIGHT = ':root,[data-scheme="light"]';
const DARK = ':root[data-color-pref="dark"],[data-scheme="dark"]';
const SYSTEM_DARK = ':root[data-color-pref="system"]';
// Print drops backgrounds, so it takes the light set, on every pinned subtree too.
const PRINT = ':root,[data-scheme],[data-scheme-d],[data-scheme-t],[data-scheme-p]';

const TIER_RANGES: readonly [attribute: string, container: string][] = [
  ['data-scheme-d', '(width > 900px)'],
  ['data-scheme-t', '(640px < width <= 900px)'],
  ['data-scheme-p', '(width <= 640px)'],
];

// The text lands in a <style> via {@html}: a value that could close the
// declaration, the rule or the element is rejected.
const UNSAFE_VALUE = /[;{}<>]/;
const PROPERTY_NAME = /^--[\w-]+$/;

export function emitSchemeBlock(selector: string, scheme: SchemeName, tokens: Readonly<Record<string, string>>): string {
  let declarations = `color-scheme:${scheme};`;
  for (const [name, value] of Object.entries(tokens)) {
    if (!PROPERTY_NAME.test(name) || UNSAFE_VALUE.test(value)) throw new Error(`Unsafe token ${name}: ${value}`);
    declarations += `${name}:${value};`;
  }
  return `${selector}{${declarations}}`;
}

export function emitSchemeCss(schemes: SchemeSets): string {
  const perTier = TIER_RANGES.map(
    ([attribute, range]) =>
      `@container canvas ${range}{` +
      emitSchemeBlock(`[${attribute}="light"]`, 'light', schemes.light) +
      emitSchemeBlock(`[${attribute}="dark"]`, 'dark', schemes.dark) +
      '}'
  ).join('');
  return (
    emitSchemeBlock(LIGHT, 'light', schemes.light) +
    `@media (prefers-color-scheme: dark){${emitSchemeBlock(SYSTEM_DARK, 'dark', schemes.dark)}}` +
    emitSchemeBlock(DARK, 'dark', schemes.dark) +
    perTier +
    `@media print{${emitSchemeBlock(PRINT, 'light', schemes.light)}}`
  );
}

/** The built-in schemes as CSS, which the emitter's unit test pins. */
export const DEFAULT_SCHEME_CSS = emitSchemeCss(DEFAULT_SCHEMES);
