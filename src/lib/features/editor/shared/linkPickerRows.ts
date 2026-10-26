// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The rows before the nodes the link picker finds, while a card's target is
// chosen: a typed address and the site pages the term names (docs/architecture/blocks/node-embeds.md,
// "Quick link targets").
import { linkTargetFromQuery } from '$lib/features/content';
import { matchSitePages, type SitePage } from './sitePages';
import type { PickerRow } from '$lib/features/search/picker';
import * as m from '$lib/paraglide/messages';

export function linkPickerRows(
  term: string,
  ctx: { retargeting: boolean; insertUrlCard: (url: string) => void; placeSitePage: (page: SitePage) => void }
): PickerRow[] {
  if (!ctx.retargeting) return [];
  const action = m.editor_link_picker_action();
  const rows: PickerRow[] = [];
  const url = linkTargetFromQuery(term);
  if (url) rows.push({ value: `url:${url}`, glyph: 'link', title: m.editor_link_picker_link_to({ url }), action, onSelect: () => ctx.insertUrlCard(url) });
  for (const site of matchSitePages(term)) {
    rows.push({
      value: `site:${site.path}`,
      glyph: 'search',
      title: site.label(),
      meta: `${m.editor_link_picker_badge_site()} · ${site.path}`,
      action,
      onSelect: () => ctx.placeSitePage(site),
    });
  }
  return rows;
}
