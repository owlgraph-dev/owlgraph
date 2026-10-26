// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The image block's node and NodeView (docs/architecture/blocks/anatomy.md). An
// atom: ProseMirror selects it by a click and moves it by a native drag.
import { Node, mergeAttributes } from '@tiptap/core';
import { widthVars, parseWidthVar, WIDTH_ATTR } from './imageWidth';
import { boxImgOverrides, boxDataAttr, positionDataAttr, backdropAttrs, normalizeBoxMode, parseBoxHeight, parseBoxAspect } from './imageBox';
import { mediaUrl } from '$lib/features/media';
import { imageSources, imageSizeOverrides } from './imageSources';
import { assetSizeOf } from './assetSizeRegistry';
import { mergeOverrides, styleAttr } from '../../capabilities/overrides';
import { imagePlacementRender, placementAttr } from '../../capabilities/placement/placement';
import { svelteNodeView, type SvelteNodeViewContext } from '../scaffold/svelteNodeView.svelte';
import { imageProps, imageWrapper, type ImageEditing } from './view';
import PageImage from './PageImage.svelte';

// One object per view, so a prop that never changes never re-renders the grip.
const editingByView = new WeakMap<object, ImageEditing>();
function imageEditing(view: SvelteNodeViewContext['view']): ImageEditing {
  let editing = editingByView.get(view);
  if (editing) return editing;
  const { editor, getPos } = view;
  editing = {
    editor,
    getPos,
    setWidth: (viewport, width, history) => {
      const pos = getPos();
      const node = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null;
      if (typeof pos !== 'number' || !node) return;
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, [WIDTH_ATTR[viewport]]: width });
      if (!history) tr.setMeta('addToHistory', false);
      editor.view.dispatch(tr);
    },
  };
  editingByView.set(view, editing);
  return editing;
}

// Stores only the asset id; the bytes are served access-checked from /api/media/<id>.
export const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      assetId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-asset-id'),
        renderHTML: (attrs) => (attrs.assetId ? { 'data-asset-id': attrs.assetId } : {}),
      },
      alt: {
        default: '',
        parseHTML: (el) => el.getAttribute('alt') ?? '',
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {}),
      },
      // % of the container per tier, null inheriting the next larger
      // (imageWidth.ts).
      width: {
        default: null,
        parseHTML: (el) => parseWidthVar((el as HTMLElement).style, '--image-width-d'),
        renderHTML: () => ({}),
      },
      widthTablet: {
        default: null,
        parseHTML: (el) => parseWidthVar((el as HTMLElement).style, '--image-width-t'),
        renderHTML: () => ({}),
      },
      widthPhone: {
        default: null,
        parseHTML: (el) => parseWidthVar((el as HTMLElement).style, '--image-width-p'),
        renderHTML: () => ({}),
      },
      placement: placementAttr(),
      // Stands in for the desktop placement until the image is placed
      // (imagePlacement); stored images still carry it.
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') ?? 'center',
        renderHTML: (attrs) => (attrs.align && attrs.align !== 'center' ? { 'data-align': attrs.align } : {}),
      },
      // A fitted box for objectFit/objectPosition (imageBox.ts). Read from the
      // <img>, the tag parseHTML matches; renderHTML mirrors it onto the frame.
      boxMode: {
        default: 'auto',
        parseHTML: (el) => normalizeBoxMode(el.getAttribute('data-box')),
        renderHTML: () => ({}),
      },
      // px, for boxMode 'height'.
      boxHeight: {
        default: null,
        parseHTML: (el) => parseBoxHeight((el as HTMLElement).style),
        renderHTML: () => ({}),
      },
      // e.g. "16/9", for boxMode 'aspect'.
      boxAspect: {
        default: null,
        parseHTML: (el) => parseBoxAspect((el as HTMLElement).style),
        renderHTML: () => ({}),
      },
      // null: 'cover' once a box mode is active.
      objectFit: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.objectFit || null,
        renderHTML: () => ({}),
      },
      // A preset, null for 'center'. Kept in data-pos: the CSS value can't be
      // read back to a preset.
      objectPosition: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-pos'),
        renderHTML: () => ({}),
      },
      // 'light' | 'dark' ground behind a transparent image (backdropAttrs).
      backdrop: {
        default: null,
        parseHTML: (el) => (el.hasAttribute('data-backdrop') ? el.getAttribute('data-scheme') : null),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-asset-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // The editor finds a block by walking up to [data-block-id], so the id goes
    // on the frame and everything else on the <img>.
    const attrs: Record<string, unknown> = { ...HTMLAttributes };
    // data-align renders only for an image never placed.
    const placed = imagePlacementRender(node.attrs);
    delete attrs['data-align'];
    if (placed.align) attrs['data-align'] = placed.align;
    const blockId = attrs['data-block-id'];
    delete attrs['data-block-id'];
    const id = node.attrs.assetId as string | null | undefined;
    // Tiptap draws this before swapping the NodeView in, and an <img> loads as
    // soon as it has a src: without the srcset that is the full image, fetched
    // beside the copy the NodeView picks.
    const sources = id ? imageSources(id, assetSizeOf(id), node.attrs, true) : null;
    const style = styleAttr(mergeOverrides(widthVars(node.attrs), imageSizeOverrides(sources, node.attrs), boxImgOverrides(node.attrs), placed.vars));
    const box = boxDataAttr(node.attrs);
    const pos = positionDataAttr(node.attrs);
    const frameAttrs: Record<string, string> = { class: 'page-image-frame' };
    if (typeof blockId === 'string') frameAttrs['data-block-id'] = blockId;
    // The fill-mode rule targets the frame; parseHTML reads the <img>.
    if (box) frameAttrs['data-box'] = box;
    // The frame fills its container, so the width % resolves against it.
    return [
      'div',
      frameAttrs,
      [
        'img',
        mergeAttributes(attrs, {
          loading: 'lazy',
          decoding: 'async',
          ...(sources?.srcset ? { srcset: sources.srcset, sizes: sources.sizes } : {}),
          src: id ? mediaUrl(id) : '',
          class: 'page-image',
          ...(style ? { style } : {}),
          ...(box ? { 'data-box': box } : {}),
          ...(pos ? { 'data-pos': pos } : {}),
          ...backdropAttrs(node.attrs),
        }),
      ],
    ];
  },

  addStorage() {
    return { capabilities: ['placement'] };
  },

  addOptions() {
    // false in the phone editor: no resize grip (docs/architecture/editor.md).
    return { interactive: true };
  },

  // ProseMirror keeps the image's events (click selection, native drag) but
  // not the grip's.
  addNodeView() {
    const interactive = this.options.interactive;
    return svelteNodeView(PageImage, {
      wrapper: (node) => imageWrapper(node.attrs),
      props: (node, { styles, view }) =>
        imageProps(node.attrs, node.attrs.assetId ? assetSizeOf(node.attrs.assetId) : undefined, (set) => styles.add(set), false, interactive ? imageEditing(view) : null),
      stopEvent: (e) => !!(e.target as Element | null)?.closest?.('.img-resize-handle'),
    });
  },
});
