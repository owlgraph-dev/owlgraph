// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Pure, so it is unit-testable without Paraglide; the concrete tree is tree.ts.
import type { Action } from '$lib/features/auth';

export interface SettingsItem {
  id: string;
  /** A section under /settings, or a page outside it (leavesSettings). */
  href: string;
  /** A section's `<resource>:manage`, or null for the personal group. The route
   * adapter enforces the same action; the tree only decides visibility. */
  action: Action | null;
  label: () => string;
  description: () => string;
  /** Extra search terms, a comma-separated message: "Logo" finds Branding. */
  keywords: () => string;
}

export interface SettingsGroup {
  id: string;
  label: () => string;
  items: SettingsItem[];
}

export const OVERVIEW_ID = 'overview';

/** Such a link is a full navigation: the settings run under the looser
 * style-src, and the page it opens gets its own (platform/cspRoutes.ts). */
export function leavesSettings(href: string): boolean {
  return href !== '/settings' && !href.startsWith('/settings/');
}

/** What the layout load checks. */
export function requiredActions(groups: SettingsGroup[]): Action[] {
  const out = new Set<Action>();
  for (const g of groups) for (const i of g.items) if (i.action) out.add(i.action);
  return [...out];
}

/** Ungated items and granted ones, with no group left empty. */
export function visibleTree(groups: SettingsGroup[], granted: ReadonlySet<string>): SettingsGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.action === null || granted.has(i.action)) }))
    .filter((g) => g.items.length > 0);
}

/** The longest href equal to the path or a `/`-bounded prefix of it; the
 * overview when nothing matches. */
export function activeItemId(groups: SettingsGroup[], pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  let best: SettingsItem | null = null;
  for (const g of groups) {
    for (const i of g.items) {
      if (p === i.href || p.startsWith(i.href + '/')) {
        if (!best || i.href.length > best.href.length) best = i;
      }
    }
  }
  return best?.id ?? OVERVIEW_ID;
}

export interface SettingsSearchHit {
  group: SettingsGroup;
  item: SettingsItem;
}

/** Own-label hits come first, so Enter on "groups" opens Property groups.
 * Pass only the visible tree, so a hidden section can't be found by searching. */
export function searchItems(groups: SettingsGroup[], query: string): SettingsSearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const byLabel: SettingsSearchHit[] = [];
  const byKeyword: SettingsSearchHit[] = [];
  for (const group of groups) {
    const groupLabel = group.label().toLowerCase();
    for (const item of group.items) {
      const label = item.label().toLowerCase();
      if (terms.every((t) => label.includes(t))) {
        byLabel.push({ group, item });
        continue;
      }
      const haystack = `${label} ${item.keywords()} ${groupLabel}`.toLowerCase();
      if (terms.every((t) => haystack.includes(t))) byKeyword.push({ group, item });
    }
  }
  return [...byLabel, ...byKeyword];
}
