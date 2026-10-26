// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The colour scheme page content renders in (docs/architecture/theming.md, "Content
// scheme"): light, dark, or adaptive (the viewer's). Null inherits, through a
// namespace level nothing sets, to the site default.

export const CONTENT_SCHEMES = ['light', 'dark', 'adaptive'] as const;
export type ContentScheme = (typeof CONTENT_SCHEMES)[number];

/** A scheme a single block pins for itself: an HTML block, an image's backdrop. */
export type PinnedScheme = 'light' | 'dark';

/** A stored pin, or null (inherit) for anything else. */
export function pinnedScheme(value: unknown): PinnedScheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** What a site renders when nothing along the chain chose. */
export const CONTENT_SCHEME_FALLBACK: ContentScheme = 'light';

export function isContentScheme(value: unknown): value is ContentScheme {
  return CONTENT_SCHEMES.includes(value as ContentScheme);
}

export function resolveContentScheme(chain: {
  page?: ContentScheme | null;
  namespace?: ContentScheme | null;
  site?: ContentScheme | null;
}): ContentScheme {
  return chain.page ?? chain.namespace ?? chain.site ?? CONTENT_SCHEME_FALLBACK;
}

/** None for adaptive: the canvas then inherits the viewer's scheme. */
export function canvasScheme(scheme: ContentScheme): 'light' | 'dark' | undefined {
  return scheme === 'adaptive' ? undefined : scheme;
}

/** `?scheme=light` or `?scheme=dark` previews an adaptive page in that scheme. */
export function previewScheme(url: URL): 'light' | 'dark' | null {
  const scheme = url.searchParams.get('scheme');
  return scheme === 'light' || scheme === 'dark' ? scheme : null;
}
