// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site vocabulary an agent should reach for before a colour literal,
// hand-rolled CSS or a bare heading level.
import type { ToolRegistry } from '../../../mcp/registry';
import { text } from '../../../mcp/registry';
import { getSiteTheme } from './theme.server';
import { listCustomStyleRefs } from './customStyles.server';
import { listParagraphStyles } from '$lib/features/content/server';
import { listEnabledPageLayoutPresets } from '$lib/features/pages/server';
import { localize } from '$lib/platform/i18n/localizedText';

export function registerSiteTools({ tool }: ToolRegistry): void {
  tool(
    'list_brand_colors',
    {
      title: 'List brand colours',
      description:
        "The site's named brand colours. Reference one in a block's surface bg/border or typography color as 'token:brand.<id>': it follows the reader's light or dark scheme (a value per scheme), and a block filled with it gets readable text automatically. Returns id, name, and the light and dark values.",
      inputSchema: {},
    },
    'page:read',
    async () => {
      const { theme } = await getSiteTheme();
      const out = (theme.brand ?? []).map((c) => ({ id: c.id, token: `token:brand.${c.id}`, name: c.name, light: c.light, dark: c.dark }));
      return text(JSON.stringify(out, null, 2));
    }
  );

  tool(
    'list_custom_styles',
    {
      title: 'List custom styles',
      description:
        "The site's named styles — reusable styling an admin defined, already written against the reader's colour scheme. Apply one in an html block by putting its `class` on an element: <span class=\"cs-lead\">…</span>. Prefer a named style over hand-written CSS, and prefer both over inline colours: a named style keeps one look in one place, and its rules use the content tokens, so it adapts to a light or dark page. `kind` says what it was made for — 'inline' wraps a run of text, 'block' a whole element. Returns id, class, label, kind and the stylesheet each belongs to.",
      inputSchema: {},
    },
    'page:read',
    async () => {
      const refs = await listCustomStyleRefs();
      const out = refs
        .filter((style) => style.enabled)
        .map((style) => ({ id: style.id, class: style.className, label: style.label, kind: style.kind, stylesheet: style.stylesheet }));
      return text(JSON.stringify(out, null, 2));
    }
  );

  tool(
    'list_paragraph_styles',
    {
      title: 'List paragraph styles',
      description:
        "The site's paragraph styles — what a heading or paragraph block is set in. Each style renders as one element (`renderAs`: p, or h1–h6) with the look an admin defined for it; exactly one style per element is the default (`isDefault`), the one a bare heading level or paragraph gets. Pass a style's id as `style` on a heading or paragraph block in append_block/update_block to set both its element and its look, the way an author picks it from the toolbar; prefer that over choosing a bare level when the site offers more than one style for an element (a display title beside the plain h1, a label beside body text). Returns id, label, labels, renderAs and isDefault, in hierarchy order: `label` is the name resolved for your request's interface language (your language preference, else Accept-Language among the enabled languages, else the site default language), `labels` every translation. Choose a style by its id, never by its name.",
      inputSchema: {},
    },
    'page:read',
    async () => {
      const styles = await listParagraphStyles();
      const out = styles.map((style) => ({ id: style.id, label: localize(style.label, style.id), labels: style.label, renderAs: style.renderAs, isDefault: style.isDefault }));
      return text(JSON.stringify(out, null, 2));
    }
  );

  tool(
    'list_page_layout_presets',
    {
      title: 'List page layouts',
      description:
        "The site's page layouts, in the order an author sees them: what set_page_layout's `layout` takes. 'standard' is the flow — blocks one after another; every other layout is a columns page: a column template per tier (columns: whole-number proportions; a phone usually stacks), the gap between columns (columnGap, per tier; unset = 'md'), and what a new section starts as (sectionDefaults: width 'wide' | 'full', absent = the reading column; bleedToTop). A layout is structure only — the page's look follows the site. Returns id, label, labels, description, descriptions, mode, columns, columnGap and sectionDefaults: `label` and `description` resolved for your request's interface language, `labels` and `descriptions` every translation. Pass a layout's id, never its name.",
      inputSchema: {},
    },
    'page:read',
    async () => {
      const presets = await listEnabledPageLayoutPresets();
      const out = presets.map((p) => ({
        id: p.id,
        label: localize(p.label, p.id),
        labels: p.label,
        description: localize(p.description, ''),
        descriptions: p.description,
        mode: p.mode,
        ...(p.template ? { columns: p.template, columnGap: p.gap, sectionDefaults: p.sectionDefaults } : {}),
      }));
      return text(JSON.stringify(out, null, 2));
    }
  );
}
