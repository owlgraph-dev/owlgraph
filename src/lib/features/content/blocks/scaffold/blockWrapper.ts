// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A block's outer wrapper, described once and drawn as the editor's NodeView
// root (applyWrapper) and the page's opening tag (wrapperOpen). Both emit the same
// classes, block id and content-addressed rule id; a block's component never
// touches it (docs/architecture/blocks/anatomy.md, "Svelte leaf blocks").
import { esc } from '$lib/platform/htmlEscape';
import type { OverrideSet } from '../../capabilities/overrides';
import { RULE_ID_ATTR, ruleIdAttribute } from '../../capabilities/pageStyles';
import type { LiveStyles } from '../../capabilities/liveStyles';
import type { JsonNode } from '../../doc/doc';
import { blockIdAttribute, type RenderContext } from '../blockRenderer';
import { islandMarker } from './hydrateIslands';

export interface BlockWrapper {
  tag?: 'div' | 'section';
  classes: string[];
  blockId?: string | null;
  /** The wrapper's merged override set, its space above included. */
  overrides: OverrideSet;
  /** Attributes the block's CSS reads: '' for a bare one, null for none. Name
   *  the same keys every time, so an update removes what is no longer set. */
  attrs?: Record<string, string | null>;
  /** The page's hydration island (hydrateIslands.ts). */
  island?: { kind: string; props: Record<string, unknown> };
}

function setOrRemove(el: HTMLElement, name: string, value: string): void {
  if (value) el.setAttribute(name, value);
  else el.removeAttribute(name);
}

/** The class ProseMirror puts on a selected node's root, which the wrapper's own classes must not wipe. */
const SELECTED_NODE = 'ProseMirror-selectednode';

/** The editor's half, on create and on every update. */
export function applyWrapper(el: HTMLElement, wrapper: BlockWrapper, styles: LiveStyles): void {
  // An attribute change on a selected block (a block settings edit) keeps it selected.
  const selected = el.classList.contains(SELECTED_NODE);
  el.className = wrapper.classes.join(' ');
  if (selected) el.classList.add(SELECTED_NODE);
  for (const [name, value] of Object.entries(wrapper.attrs ?? {})) {
    if (value == null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }
  setOrRemove(el, 'data-block-id', wrapper.blockId ?? '');
  setOrRemove(el, RULE_ID_ATTR, styles.add(wrapper.overrides));
}

function attributes(attrs: BlockWrapper['attrs']): string {
  let out = '';
  for (const [name, value] of Object.entries(attrs ?? {})) if (value != null) out += ` ${name}="${esc(value)}"`;
  return out;
}

/** The page's half: the opening tag. */
export function wrapperOpen(wrapper: BlockWrapper, node: JsonNode, ctx: Pick<RenderContext, 'styles' | 'schemeAttributes'>): string {
  const island = wrapper.island ? islandMarker(wrapper.island.kind, wrapper.island.props, esc) : '';
  return `<${wrapper.tag ?? 'div'} class="${esc(wrapper.classes.join(' '))}"${attributes(wrapper.attrs)}${ctx.schemeAttributes(node)}${blockIdAttribute(node)}${ruleIdAttribute(ctx.styles, wrapper.overrides)}${island}>`;
}

export function wrapperHtml(wrapper: BlockWrapper, node: JsonNode, ctx: Pick<RenderContext, 'styles' | 'schemeAttributes'>, inner: string): string {
  return `${wrapperOpen(wrapper, node, ctx)}${inner}</${wrapper.tag ?? 'div'}>`;
}
