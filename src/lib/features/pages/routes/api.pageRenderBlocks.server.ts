// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/render-blocks/+server.ts.
import type { JsonNode } from '$lib/features/content';
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getPage, userCanWritePage } from '$lib/features/pages/server';
import { linkSlugMap } from '$lib/features/graph/server';
import { renderDoc, getCustomFontEntries, getParagraphStyles } from '$lib/features/content/server';
import { customFontStacksRecord, customStyleClassMap, compileContentTheme, StyleCollector, pageCanvasOverrides, pageRhythmPx } from '$lib/features/content';
import { listCustomStyleRefs, getSiteTheme } from '$lib/features/site/server';
import { withContentLocale } from '$lib/platform/i18n/contentLocale.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string };

// The reconcile panel's previews, each block as a one-block doc through the
// public renderer. The previews are one document, so they share one collector.
export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: params.id });
  const body = await request.json().catch(() => ({}));
  const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
  const slugMap = await linkSlugMap(params.id);
  // The registries the reader's render uses, or the diff shows a difference
  // the reader never sees.
  const [customStacks, paragraphStyles, styleRefs, siteTheme] = await Promise.all([
    getCustomFontEntries().then(customFontStacksRecord),
    getParagraphStyles(),
    listCustomStyleRefs(),
    getSiteTheme(),
  ]);
  const styles = new StyleCollector();
  const { blockDefaults } = compileContentTheme(siteTheme.theme, siteTheme.version);
  const opts = {
    typographyRegistry: { customStacks, paragraphStyles },
    customStyles: customStyleClassMap(styleRefs),
    blockDefaults,
    styles,
  };
  // Each preview's canvas shares one rule, with the site's rhythm.
  const canvasRuleId = styles.add(pageCanvasOverrides(undefined, pageRhythmPx(blockDefaults)));
  const html = await withContentLocale(page.locale, () =>
    blocks.map((b: unknown) => renderDoc({ type: 'doc', content: [b as JsonNode] }, slugMap, {}, opts).html)
  );
  return json({ html, css: styles.css(), canvasRuleId });
};
