// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An image block's attrs as its frame (the wrapper its width % resolves
// against) and PageImage.svelte's props, for the editor and the page.
import { mediaUrl } from '$lib/features/media';
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import { imagePlacementRender } from '../../capabilities/placement/placement';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { SvelteNodeViewContext } from '../scaffold/svelteNodeView.svelte';
import type { ImageAttrs } from './model';
import { widthVars } from './imageWidth';
import { backdropAttrs, boxDataAttr, boxImgOverrides, positionDataAttr } from './imageBox';
import { imageSizeOverrides, imageSources, type ImageSize } from './imageSources';
import type { Tier } from '../../capabilities/cascade';

export interface ImageEditing extends Pick<SvelteNodeViewContext['view'], 'editor' | 'getPos'> {
  /** Null clears the viewport's own width; `history` is false while a drag moves. */
  setWidth(viewport: Tier, width: number | null, history: boolean): void;
}

/** The frame carries the fill mode's mark: it is what a fill fills. */
export function imageWrapper(attrs: ImageAttrs | undefined): BlockWrapper {
  return {
    classes: ['page-image-frame'],
    blockId: attrs?.blockId ?? null,
    attrs: { 'data-box': boxDataAttr(attrs ?? {}) },
    overrides: spaceAboveOverrides(attrs),
  };
}

/**
 * `rule` registers an override set with the surface's stylesheet and returns
 * its id. `lead` is the page's opening image, loaded at once; every other
 * image, the editor's included, loads lazily.
 */
export function imageProps(
  attrs: ImageAttrs,
  size: ImageSize | undefined,
  rule: (set: OverrideSet) => string,
  lead: boolean,
  editing: ImageEditing | null
) {
  const id = attrs.assetId ? String(attrs.assetId) : '';
  const sources = id ? imageSources(id, size, attrs, !lead) : null;
  const placed = imagePlacementRender(attrs);
  return {
    src: id ? mediaUrl(id) : '',
    srcset: sources?.srcset ?? null,
    sizes: sources?.sizes ?? null,
    alt: String(attrs.alt ?? ''),
    ruleId: rule(mergeOverrides(widthVars(attrs), imageSizeOverrides(sources, attrs), boxImgOverrides(attrs), placed.vars)),
    align: placed.align ?? null,
    box: boxDataAttr(attrs),
    position: positionDataAttr(attrs),
    backdrop: backdropAttrs(attrs)['data-scheme'] ?? null,
    lead,
    editing,
  };
}
