// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The named styles for the browser, set by the root layout: renderHTML takes
// no parameters. SSR threads them through renderDoc instead, since a module
// global would be shared across requests. A ref carries the finished class,
// built beside the compiler's selector (site/customStyles/slug.ts), so the two
// can't drift and content needs no import from site (a cycle).

export interface CustomStyleRef {
  /** The stable id content stores. */
  id: string;
  className: string;
  label: string;
  kind: 'inline' | 'block';
  /** The stylesheet it belongs to, for grouping the picker. */
  stylesheet: string;
  /** False when its stylesheet is switched off: still resolves, never offered. */
  enabled: boolean;
}

let styles: readonly CustomStyleRef[] = [];
let byId: Map<string, CustomStyleRef> = new Map();

export function setCustomStyles(next: readonly CustomStyleRef[] | null | undefined): void {
  styles = next ?? [];
  byId = new Map(styles.map((style) => [style.id, style]));
}

/** Null for a deleted style, which renders its run unstyled. */
export function customStyleClass(id: string | null | undefined): string | null {
  return (id && byId.get(id)?.className) || null;
}

/**
 * Inline styles whose stylesheet is on. A disabled sheet's styles still
 * resolve, so switching it back on leaves its content styled.
 */
export function listApplicableCustomStyles(): readonly CustomStyleRef[] {
  return styles.filter((style) => style.enabled && style.kind === 'inline');
}

/** Every style, both kinds — the HTML block may put either class on its own markup. */
export function listAllCustomStyles(): readonly CustomStyleRef[] {
  return styles.filter((style) => style.enabled);
}

/** id -> class; threaded through renderDoc, since stylesheets are scoped, not one per site. */
export type CustomStyleClasses = Readonly<Record<string, string>>;

/** The render-path shape, built from the refs the server loaded. */
export function customStyleClassMap(refs: readonly CustomStyleRef[]): CustomStyleClasses {
  return Object.fromEntries(refs.map((style) => [style.id, style.className]));
}
