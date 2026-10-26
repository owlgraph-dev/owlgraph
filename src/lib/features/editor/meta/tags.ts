// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node's tags as its editors change them, desktop popover and phone sheet
// alike.

/** The tags with one more; null for a blank one or one already there in any case. */
export function addTag(tags: readonly string[], value: string | null): string[] | null {
  const t = (value ?? '').trim();
  if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return null;
  return [...tags, t];
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}
