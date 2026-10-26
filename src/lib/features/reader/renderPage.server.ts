// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one render of a page for its reader (docs/architecture/overview.md, "Editor vs.
// public render — and why they must match"). Everything viewer-scoped is resolved here, as the reader,
// because the walker (content/render/render.server.ts) is synchronous.
import { withContentLocale } from '$lib/platform/i18n/contentLocale.server';
import type { Logger } from '$lib/platform/logger.server';
import type { SessionUser } from '$lib/features/auth';
import type { PageRow } from '$lib/features/pages/server';
import { linkSlugMap, publicLinkSlugMap } from '$lib/features/graph/server';
import { renderDoc, getCustomFontEntries, getParagraphStyles, getContentSchemeDefault } from '$lib/features/content/server';
import {
  collectAssetIds,
  compileContentTheme,
  computeFirstBlockBleeds,
  customFontStacksRecord,
  customStyleClassMap,
  pageAttrsOf,
  pageCanvasOverrides,
  pageGroundOverrides,
  pageRhythmPx,
  resolveContentScheme,
  StyleCollector,
  type ContentScheme,
  type ImagePreload,
  type JsonNode,
} from '$lib/features/content';
import { listCustomStyleRefs, getSiteTheme } from '$lib/features/site/server';
import { getAssetSizes } from '$lib/features/media/server';
import { resolveQueryBlocks } from '$lib/features/query/server';
import { resolveCollectionBlocks } from '$lib/features/collections/server';
import { resolveDocumentBlocks } from '$lib/features/documents/server';
import { resolvePluginBlockData } from '$lib/features/pluginHost/server';

/**
 * Who a page is rendered for. The caller has already decided this reader may
 * read the page: the read route by visibility, a share link by its token, the
 * MCP by its tool gate.
 */
export type PageReader =
  /** `locale` is the interface language, for a plugin's host. */
  | { kind: 'visitor'; user: SessionUser | null; locale: string; log: Logger; returnTo: string }
  /** Anonymous: the link grants the page, never what its blocks show. No `user` field, so none can be handed in. */
  | { kind: 'share'; locale: string; log: Logger }
  /** As its token's user (get_page_html); it reads no service live. */
  | { kind: 'agent'; user: SessionUser; log: Logger };

export type RenderablePage = Pick<PageRow, 'id' | 'doc' | 'locale' | 'content_scheme'>;

export interface RenderedPage {
  html: string;
  /** For one nonce'd <style> (content/capabilities/pageStyles.ts); '' when empty. */
  css: string;
  /** For the head (content/blocks/image/leadImage.ts). */
  preloads: ImagePreload[];
  /** The `data-b` ids of the canvas, the reading area around it and the area after the page (the share page's referenced-by list); '' where not drawn. */
  canvasRuleId: string;
  groundRuleId: string;
  afterRuleId: string;
  firstBlockBleeds: boolean;
  contentScheme: ContentScheme;
}

export async function renderPage(
  page: RenderablePage,
  reader: PageReader,
  opts: { previewScheme?: 'light' | 'dark' | null } = {}
): Promise<RenderedPage> {
  const user = reader.kind === 'share' ? null : reader.user;
  // Through a share link, links resolve only to what an anonymous reader may
  // follow, never to a cached slug (trustCachedSlug), which could name a hidden
  // namespace's page.
  const slugMap = reader.kind === 'share' ? await publicLinkSlugMap(page.id) : await linkSlugMap(page.id);
  // Query output is content, so it renders in the content language (docs/architecture/languages.md).
  const queryResults = await withContentLocale(page.locale, () => resolveQueryBlocks(page.doc, user, page.id));
  const [customStacks, paragraphStyles, siteScheme, styleRefs, siteTheme, assetSizes, pluginBlockData, collectionBlocks, documentBlocks] = await Promise.all([
    getCustomFontEntries().then(customFontStacksRecord),
    getParagraphStyles(),
    getContentSchemeDefault(),
    listCustomStyleRefs(),
    getSiteTheme(),
    // The sizes pick the image copies offered (docs/architecture/media.md).
    reader.kind !== 'agent' && page.doc ? getAssetSizes(collectAssetIds(page.doc as JsonNode)) : {},
    // As the visitor, or as nobody through a share link; an agent reads no
    // service live (docs/architecture/mcp.md).
    reader.kind === 'visitor'
      ? resolvePluginBlockData(page.doc, { user, locale: reader.locale, log: reader.log, returnTo: reader.returnTo })
      : reader.kind === 'share'
        ? resolvePluginBlockData(page.doc, { user: null, locale: reader.locale, log: reader.log })
        : {},
    // As this reader may read them, never as their author could (docs/architecture/blocks/node-embeds.md).
    resolveCollectionBlocks(page.doc, user, reader.log),
    resolveDocumentBlocks(page.doc, user, reader.log),
  ]);
  // The capability defaults the emitters leave out: the theme stylesheet supplies them.
  const { blockDefaults } = compileContentTheme(siteTheme.theme, siteTheme.version);
  const settings = pageAttrsOf(page.doc as { attrs?: Record<string, unknown> } | null);
  const rhythm = pageRhythmPx(blockDefaults);
  // The frame's rules, then every block's overrides; elements carry `data-b`,
  // never a style attribute (CSP). An agent's page has no frame.
  const styles = new StyleCollector();
  const framed = reader.kind !== 'agent';
  const canvasRuleId = framed ? styles.add(pageCanvasOverrides(settings, rhythm)) : '';
  const groundRuleId = framed ? styles.add(pageGroundOverrides(settings)) : '';
  const afterRuleId = reader.kind === 'share' ? styles.add(pageCanvasOverrides({ layout: settings.layout }, rhythm)) : '';
  const { html, preloads } = await withContentLocale(page.locale, () =>
    renderDoc(page.doc, slugMap, queryResults, {
      trustCachedSlug: reader.kind !== 'share',
      typographyRegistry: { customStacks, paragraphStyles },
      customStyles: customStyleClassMap(styleRefs),
      blockDefaults,
      styles,
      assetSizes,
      blockData: { ...pluginBlockData, ...collectionBlocks, ...documentBlocks },
    })
  );
  const first = (page.doc as { content?: { type?: string; attrs?: Record<string, unknown> }[] } | null)?.content?.[0];
  return {
    html,
    css: styles.css(),
    preloads,
    canvasRuleId,
    groundRuleId,
    afterRuleId,
    firstBlockBleeds: computeFirstBlockBleeds(first?.type ?? null, first?.attrs ?? null),
    // docs/architecture/theming.md, "Content scheme".
    contentScheme: opts.previewScheme ?? resolveContentScheme({ page: page.content_scheme, site: siteScheme }),
  };
}
