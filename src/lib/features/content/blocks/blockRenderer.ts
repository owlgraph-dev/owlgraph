// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The contract between the public render walker (render/render.server.ts) and
// each block's renderer, which turns one stored node into HTML. Everything
// cross-block or per-request comes in through the context, so a block never
// reaches into the walker. Renderers are registered in blocks/renderers.ts.
import type { Component } from 'svelte';
import { esc } from '$lib/platform/htmlEscape';
import { spaceAboveOverrides, type SpacingData } from '../capabilities/spacing/spacing';
import type { OverrideSet } from '../capabilities/overrides';
import { ruleIdAttribute, type StyleCollector } from '../capabilities/pageStyles';
import type { JsonNode } from '../doc/doc';
import type { TypographyRegistry } from '../capabilities/typography/roles';
import type { ResolvedBlockDefaults } from '../capabilities/defaults/blockDefaults';
import type { QueryBlockResult } from './query/result';
import type { CustomStyleClasses } from '../inline/customStyleRegistry';
import type { ImageSize } from './image/imageSources';

export interface RenderContext {
  /** Render one block node — how a container recurses into its children. */
  renderNode(node: JsonNode): string;
  /** Render inline content: text nodes with their marks, hard breaks. */
  renderInline(nodes?: JsonNode[]): string;
  /**
   * The node's scheme-region attributes (color/schemeRegions.ts) as attribute text
   * with a leading space, or ''. A block with a Surface background puts them
   * on its outermost element.
   */
  schemeAttributes(node: JsonNode): string;
  /** Registered custom fonts + the site's resolved paragraph styles for this request. */
  registry: TypographyRegistry;
  /** The site's resolved capability defaults (capabilities/defaults) — what an emitter leaves out. */
  blockDefaults: ResolvedBlockDefaults;
  /** id -> class for this scope's named styles (docs/architecture/custom-styles.md). */
  customStyles: CustomStyleClasses;
  /**
   * A page or document id's current href. `cachedSlug` is the slug stored on
   * the node; the walker decides whether it may serve as a fallback.
   */
  nodeHref(targetId: string | null | undefined, cachedSlug?: string): string;
  /** Resolved query-block results for this page, keyed by blockId. */
  queryResults: Record<string, QueryBlockResult>;
  /**
   * What a plugin block's resolver found for this viewer before the render,
   * keyed by blockId (docs/architecture/plugins.md). A block with no entry renders its
   * unresolved state: the MCP and the diff preview resolve nothing.
   */
  blockData: Readonly<Record<string, unknown>>;
  /**
   * A block's Svelte component rendered to HTML (scaffold/ssrBlock.ts), for blocks
   * outside this feature, which must not import its server half.
   */
  ssr<P extends Record<string, unknown>>(component: Component<P>, props: P): string;
  /**
   * The storage-boundary sanitizer, for blocks that carry raw HTML. Its output
   * has no style attributes: inline styles are lifted into `styles`.
   */
  sanitizeFragment(html: string): string;
  /**
   * This render pass's per-page stylesheet (capabilities/pageStyles.ts): an
   * element's override set is registered here and named on it as `data-b`.
   * Nested renders share it through this context.
   */
  styles: StyleCollector;
  /** Server-side syntax highlighting (escaped text when the grammar is unknown). */
  highlightCode(code: string, lang: string | null | undefined): string;
  /** An image asset's measured size (docs/architecture/media.md), when the caller looked it up; undefined renders it by its src alone. */
  assetSize(id: string): ImageSize | undefined;
  /** Whether this image is the page's opening image (image/leadImage.ts), loaded first. */
  isLeadImage(node: JsonNode): boolean;
}

export type BlockRenderer = (node: JsonNode, ctx: RenderContext) => string;

export function renderChildren(node: JsonNode, ctx: RenderContext): string {
  return (node.content ?? []).map(ctx.renderNode).join('');
}

/**
 * ` data-block-id="…"` for a block's outermost element, or ''. Every
 * addressable block must emit it in the editor and on the page: the spacing rule in app.css
 * selects blocks by it, so a block without it loses its space above.
 */
export function blockIdAttribute(node: JsonNode): string {
  const id = node.attrs?.blockId;
  return typeof id === 'string' && id ? ` data-block-id="${esc(id)}"` : '';
}

/**
 * ` data-b="…"` for an override set, or ''. Hand it an element's merged set,
 * once: an element carries one `data-b`. Never write a style attribute
 * instead; the reader's routes ship a strict style-src.
 */
export function overrideAttribute(ctx: Pick<RenderContext, 'styles'>, set: OverrideSet): string {
  return ruleIdAttribute(ctx.styles, set);
}

/**
 * ` data-b="…"` carrying a block's own space-above override, or ''. A block
 * that emits a set of its own merges `spaceAboveOverrides` into it instead.
 */
export function spaceAboveAttribute(node: JsonNode, ctx: Pick<RenderContext, 'styles'>): string {
  return overrideAttribute(ctx, spaceAboveOverrides(node.attrs as { spacing?: SpacingData | null } | undefined));
}
