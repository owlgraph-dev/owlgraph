// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one place a content URL is built. The default space has no slug and
// no prefix.
export function nodePath(spaceSlug: string | null | undefined, slug: string, opts?: { edit?: boolean }): string {
  const base = spaceSlug ? `/${spaceSlug}/${slug}` : `/${slug}`;
  return opts?.edit ? `${base}/edit` : base;
}
