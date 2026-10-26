// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Renders a stored doc to HTML for the read view. Hand-written rather than
// @tiptap/html's generateHTML, which would lose an htmlBlock's content (it
// lives in an attribute). Links store the target's id and resolve its current
// slug through `slugMap` (graph/graph.server.ts), so renaming never breaks them.
//
// Text is escaped, and html blocks are sanitized again here: defence in depth
// for rows written by any other path.
import { sanitizeFragmentInto } from './sanitize.server';
import { StyleCollector, ruleIdAttribute } from '../capabilities/pageStyles';
import { lowlight } from '../blocks/code/highlight';
import { esc } from '$lib/platform/htmlEscape';
import { safeLinkHref } from './linkHref';
import { isParameterName } from '$lib/features/semantic';
import type { QueryBlockResult } from '../blocks/query/result';
import type { Root as HastRoot, RootContent as HastContent } from 'hast';
import type { JsonDoc, JsonNode } from '../doc/doc';
import { blockRenderer } from '../blocks/renderers';
import type { RenderContext } from '../blocks/blockRenderer';
import { ssrBlock } from '../blocks/scaffold/ssrBlock';
import type { ImageSize } from '../blocks/image/imageSources';
import { leadImage, leadImagePreloads, type LeadImage, type ImagePreload } from '../blocks/image/leadImage';
import type { CustomStyleClasses } from '../inline/customStyleRegistry';
import { safeColor } from '../capabilities/parse';
import { colorCss } from '../color/colorTokens';
import { groundStep, schemeAttributeHtml, pageGrounds, type Grounds } from '../color/schemeRegions';
import { pageColumnsOf, type PageLayout } from '../page/pageAttrs';
import { normalizeStrays } from '../page/pageSections';
import { isUnknownType } from '../doc/unknownBlocks';
import { WEIGHT_PRESETS, familyOrNull, weightOrNull, lineHeightOrNull, letterSpacingOrNull } from '../capabilities/typography/typography';
import { sizeCss, sizeOrNull } from '../capabilities/typography/typeScale';
import { EMPTY_TYPOGRAPHY_REGISTRY, type TypographyRegistry } from '../capabilities/typography/roles';
import { BUILTIN_BLOCK_DEFAULTS, type ResolvedBlockDefaults } from '../capabilities/defaults/blockDefaults';
import { resolveFontStack } from '../capabilities/typography/fonts';

// A minimal hast serializer instead of hast-util-to-html. lowlight emits only
// <span class="hljs-…">; text is escaped.
function hastToHtml(node: HastRoot | HastContent): string {
  if (node.type === 'text') return esc(String(node.value ?? ''));
  if (node.type === 'element') {
    const className = node.properties?.className;
    const cls = Array.isArray(className) ? className.join(' ') : '';
    const open = `<${node.tagName}${cls ? ` class="${esc(cls)}"` : ''}>`;
    return open + (node.children ?? []).map(hastToHtml).join('') + `</${node.tagName}>`;
  }
  if (node.type === 'root') return (node.children ?? []).map(hastToHtml).join('');
  return '';
}

function highlightCode(code: string, lang: string | null | undefined): string {
  if (lang && lang !== 'plaintext' && lowlight.registered(lang)) {
    try {
      return (lowlight.highlight(lang, code).children ?? []).map(hastToHtml).join('');
    } catch {
      // unknown grammar / highlight failure — fall back to plain escaped text
    }
  }
  return esc(code);
}

type SlugMap = Record<string, string>;

function nodeHref(targetId: string | null | undefined, cachedSlug: string | undefined, slugMap: SlugMap): string {
  const slug = (targetId && slugMap[targetId]) || cachedSlug || '';
  return slug ? `/${esc(slug)}` : '#';
}

// Innermost first; stored mark order isn't guaranteed. A link takes its colour
// from `.prose a`, not by inheritance, so a typography colour span must sit
// inside the <a> or the link's rule wins.
const MARK_RENDER_ORDER = [
  'typographyFamily',
  'typographySize',
  'typographyColor',
  'typographyWeight',
  'typographyLineHeight',
  'typographyLetterSpacing',
  // Inside the links for the same reason; outside the finer-grained typography spans.
  'customStyle',
  'code',
  'italic',
  'strike',
  'pageLink',
  'docLink',
  'semanticProperty',
  'link',
] as const;

function renderMarkWrap(
  type: string,
  attrs: Record<string, unknown> | undefined,
  html: string,
  slugMap: SlugMap,
  trustCachedSlug: boolean,
  registry: TypographyRegistry,
  customStyles: CustomStyleClasses,
  styles: StyleCollector
): string {
  switch (type) {
    case 'italic': return `<em>${html}</em>`;
    case 'strike': return `<s>${html}</s>`;
    case 'code': return `<code>${html}</code>`;
    case 'link': return `<a href="${esc(safeLinkHref(attrs?.href))}" rel="noopener noreferrer nofollow">${html}</a>`;
    case 'pageLink': return `<a class="page-link" href="${nodeHref(attrs?.targetPageId as string | null, trustCachedSlug ? (attrs?.targetSlug as string | undefined) : undefined, slugMap)}">${html}</a>`;
    case 'docLink': return `<a class="doc-link" href="${nodeHref(attrs?.targetDocId as string | null, undefined, slugMap)}">${html}</a>`;
    case 'semanticProperty': {
      // A template parameter is a slot, not a property claim: plain text once bound.
      const propName = String(attrs?.propName ?? '');
      if (isParameterName(propName)) return html;
      return `<span class="sem-prop" data-prop="${esc(propName)}">${html}</span>`;
    }
    case 'customStyle': {
      // The class comes from the registry, never the stored attribute, so
      // nothing needs escaping; an unknown style renders unstyled (docs/architecture/custom-styles.md).
      const className = customStyles[String(attrs?.styleId ?? '')];
      return className ? `<span class="${className}">${html}</span>` : html;
    }
    // A typography mark is a one-declaration override set, carried by `data-b` like a block's.
    case 'typographyFamily': {
      const family = familyOrNull(attrs?.family);
      const stack = resolveFontStack(family, registry.customStacks);
      return stack ? `<span${ruleIdAttribute(styles, { 'font-family': stack })}>${html}</span>` : html;
    }
    case 'typographySize': {
      const size = sizeOrNull(attrs?.size);
      return size != null ? `<span${ruleIdAttribute(styles, { 'font-size': sizeCss(size) })}>${html}</span>` : html;
    }
    case 'typographyColor': {
      const color = safeColor(attrs?.color);
      return color ? `<span${ruleIdAttribute(styles, { color: colorCss(color) })}>${html}</span>` : html;
    }
    case 'typographyWeight': {
      const weight = weightOrNull(attrs?.weight);
      return weight ? `<span${ruleIdAttribute(styles, { 'font-weight': String(WEIGHT_PRESETS[weight]) })}>${html}</span>` : html;
    }
    case 'typographyLineHeight': {
      const lineHeight = lineHeightOrNull(attrs?.lineHeight);
      return lineHeight != null ? `<span${ruleIdAttribute(styles, { 'line-height': String(lineHeight) })}>${html}</span>` : html;
    }
    case 'typographyLetterSpacing': {
      const letterSpacing = letterSpacingOrNull(attrs?.letterSpacing);
      return letterSpacing != null ? `<span${ruleIdAttribute(styles, { 'letter-spacing': `${letterSpacing}em` })}>${html}</span>` : html;
    }
    default: return html;
  }
}

/** What renderDoc returns: the markup, and the per-page stylesheet its `data-b` attributes point into. */
export interface RenderedDoc {
  html: string;
  /** Unlayered CSS for a nonce'd <style> in the document head (pageStyles.ts); '' when nothing is overridden. */
  css: string;
  /** Image preloads for the document head: a background the page opens with (leadImage.ts). */
  preloads: ImagePreload[];
}

// trustCachedSlug: whether a link may fall back to its authoring-time cached
// slug when slugMap lacks the target. A share-link reader passes false, or a
// raw href could name a hidden namespace's page. slugMap itself must already
// be scoped to the viewer (publicLinkSlugMap); this closes the second leak.
export function renderDoc(
  doc: JsonDoc | null | undefined,
  slugMap: SlugMap = {},
  queryResults: Record<string, QueryBlockResult> = {},
  opts: {
    trustCachedSlug?: boolean;
    typographyRegistry?: TypographyRegistry;
    customStyles?: CustomStyleClasses;
    blockDefaults?: ResolvedBlockDefaults;
    /**
     * Shared by a caller rendering several docs into one page (the diff
     * preview); otherwise each call gets its own, which keeps concurrent
     * renders apart.
     */
    styles?: StyleCollector;
    /** The doc's image sizes, which pick the copies offered (docs/architecture/media.md); absent, src alone. */
    assetSizes?: Record<string, ImageSize>;
    /** Data from outside the document, resolved for this request's viewer, keyed by blockId. */
    blockData?: Readonly<Record<string, unknown>>;
  } = {}
): RenderedDoc {
  const trustCachedSlug = opts.trustCachedSlug ?? true;
  const styles = opts.styles ?? new StyleCollector();
  const blockDefaults = opts.blockDefaults ?? BUILTIN_BLOCK_DEFAULTS;
  const customStyles = opts.customStyles ?? {};
  // Passed in, never module state: the server renders concurrent requests.
  const registry = opts.typographyRegistry ?? EMPTY_TYPOGRAPHY_REGISTRY;
  function renderInlineNode(node: JsonNode): string {
    // What this build cannot read shows nothing (docs/architecture/blocks/anatomy.md, "Unknown blocks").
    if (isUnknownType(node)) return '';
    if (node.type === 'hardBreak') return '<br/>';
    if (node.type !== 'text') return '';
    let html = esc(node.text ?? '');
    const marks: { type: string; attrs?: Record<string, unknown> }[] = node.marks ?? [];
    for (const type of MARK_RENDER_ORDER) {
      const mark = marks.find((m) => m.type === type);
      if (mark) html = renderMarkWrap(type, mark.attrs, html, slugMap, trustCachedSlug, registry, customStyles, styles);
    }
    return html;
  }

  function renderInline(nodes: JsonNode[] = []): string {
    return nodes.map(renderInlineNode).join('');
  }

  // Each block's scheme attributes are decided on the way down, before its
  // renderer runs, whatever it renders first (schemeRegions.ts).
  let grounds: Grounds = pageGrounds(doc?.attrs);
  const schemes = new WeakMap<JsonNode, string>();

  // A node this build cannot read renders nothing, content included: whatever
  // gated it from a reader is unknown too (docs/architecture/blocks/anatomy.md, "Unknown blocks").
  function renderNode(node: JsonNode): string {
    if (isUnknownType(node)) return '';
    const outer = grounds;
    const step = groundStep(node, outer);
    schemes.set(node, schemeAttributeHtml(step));
    grounds = step.inner;
    try {
      const render = blockRenderer(node.type);
      if (render) return render(node, ctx);
      return node.content
        ? node.content.map((c) => (c.type === 'text' ? renderInlineNode(c) : renderNode(c))).join('')
        : '';
    } finally {
      grounds = outer;
    }
  }

  const ctx: RenderContext = {
    renderNode,
    renderInline,
    schemeAttributes: (node) => schemes.get(node) ?? '',
    registry,
    blockDefaults,
    customStyles,
    nodeHref: (targetId, cachedSlug) => nodeHref(targetId, trustCachedSlug ? cachedSlug : undefined, slugMap),
    queryResults,
    blockData: opts.blockData ?? {},
    ssr: ssrBlock,
    sanitizeFragment: (html) => sanitizeFragmentInto(html, styles),
    highlightCode,
    styles,
    assetSize: (id) => opts.assetSizes?.[id],
    isLeadImage: (node) => lead?.kind === 'image' && lead.node === node,
  };
  let lead: LeadImage | null = null;

  // On a columns page a stray block renders in an implicit section, main
  // column, whose id comes from its first block so renders are stable.
  const columns = pageColumnsOf(doc?.attrs?.layout as PageLayout | undefined);
  const content = normalizeStrays(doc ?? { type: 'doc' }, columns, 'empty', (first, index) => `implicit-${String(first.attrs?.blockId ?? index)}`).content ?? [];
  lead = leadImage(content);
  const html = content.map(renderNode).join('\n');
  return { html, css: styles.css(), preloads: leadImagePreloads(lead) };
}
