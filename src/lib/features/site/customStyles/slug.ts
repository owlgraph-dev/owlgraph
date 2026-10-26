// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The class a named style's label becomes, shared so the settings modal shows
// the class the server will store. A slug is fixed at creation: a class that
// followed the label would unstyle every page using it on a rename
// (docs/architecture/custom-styles.md).

/** Longer than any sensible label, short enough to keep a class readable. */
const MAX_SLUG = 40;

const TRANSLITERATE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

export function slugFromLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => TRANSLITERATE[c] ?? c)
    // Strip the remaining accents, so "Résumé" becomes "resume".
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  // A label of nothing but punctuation still needs a name to collide on.
  return slug || 'stil';
}

/** The class a named style renders as. Here, postcss-free, so rendering a style needn't load the compiler. */
export function styleClass(slug: string): string {
  return `cs-${slug}`;
}
