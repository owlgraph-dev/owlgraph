// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one place a content URL is built. The default namespace has no slug and
// no prefix.
export function nodePath(namespaceSlug: string | null | undefined, slug: string, opts?: { edit?: boolean }): string {
  const base = namespaceSlug ? `/${namespaceSlug}/${slug}` : `/${slug}`;
  return opts?.edit ? `${base}/edit` : base;
}
