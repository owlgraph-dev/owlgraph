// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The query block: a filter or traversal plus one grid child, which
// is the template, edited with the normal block tools. A value marked as a
// semantic property becomes a parameter (docs/architecture/dynamic-rendering.md). The editor
// shows the one authoring instance with placeholder values; the page stamps it
// once per result (render.ts), the results fetched before renderDoc runs so
// that it stays synchronous.
import { Node, mergeAttributes } from '@tiptap/core';
import { placementAttr } from '../../capabilities/placement/placement';
import { getBlockDefaults } from '../../capabilities/defaults/defaultsRegistry';
import { wrapperNodeView } from '../scaffold/wrapperNodeView';
import { queryWrapper } from './view';
import { collectHtmlBlockParams, mergeTemplateParam, type TemplateParam } from '../../template/templateParams';

type N = any;

function jsonAttr(key: string, dataName: string) {
  return {
    default: null,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute(dataName);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [dataName]: JSON.stringify(attrs[key]) } : {})
  };
}

export const QueryBlock = Node.create({
  name: 'queryBlock',
  group: 'block',
  content: 'grid',
  isolating: true,

  addAttributes() {
    return {
      // Declared here (the catalogue's ownBlockIdAttr), matching blockId.ts.
      blockId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-block-id'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.blockId ? { 'data-block-id': attrs.blockId } : {})
      },
      first: { default: 20 },
      // `filter` and `traversal` (WireTraversalQuery) are mutually exclusive.
      filter: jsonAttr('filter', 'data-filter'),
      traversal: jsonAttr('traversal', 'data-traversal'),
      // Starts the traversal at the embedding page, resolved on the server
      // rather than as a magic id in the GraphQL schema.
      fromCurrentPage: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-from-current-page') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.fromCurrentPage ? { 'data-from-current-page': 'true' } : {})
      },
      // WireOrderByInput | null.
      orderBy: jsonAttr('orderBy', 'data-order-by'),
      // A registry key (formats.ts), though 'template' is the only format.
      format: { default: 'template' },
      // WrapperMapping | null; a key without an entry binds by name (bindTemplate).
      mapping: jsonAttr('mapping', 'data-mapping'),
      // The result container's options for the active format. Not part of the
      // query definition: the block settings panel edits it, and the query modal's merge on
      // save leaves it alone.
      formatOptions: jsonAttr('formatOptions', 'data-format-options'),
      // 'normal' | 'wide' | 'full', a node attr rather than a format option:
      // it places the whole block, whatever its format.
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-width'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.width && attrs.width !== 'normal' ? { 'data-width': attrs.width } : {})
      },
      // Like width, a node concern whatever the format.
      placement: placementAttr(),
      // Drops the canvas's top padding when this is the page's first block
      // (computeFirstBlockBleeds); inert anywhere else.
      bleedToTop: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-bleed-top'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.bleedToTop ? { 'data-bleed-top': '' } : {})
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-query-block]' }];
  },

  // The clipboard's form; the NodeView below draws the block.
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-query-block': '' }), 0];
  },

  // The result container is the block wrapper, the template ProseMirror's.
  addNodeView() {
    return wrapperNodeView({ wrapper: (node) => queryWrapper(node.attrs, getBlockDefaults()) });
  }
});

// The mapping UI's parameter list, from the live editor node: semanticProperty
// marks and an htmlBlock's {{{key:type}}} tokens, parsed by the grammar the
// renderer substitutes with. For a repeated key the first typed declaration wins.
export function collectTemplateParams(queryBlockNode: N): TemplateParam[] {
  const params = new Map<string, TemplateParam>();
  queryBlockNode?.descendants?.((node: N) => {
    if (node.isText) {
      const mark = node.marks?.find((m: N) => m.type?.name === 'semanticProperty');
      const key = mark?.attrs?.propName;
      if (key) {
        mergeTemplateParam(params, { key: String(key), declaredType: mark?.attrs?.paramType ? String(mark.attrs.paramType) : null });
      }
    } else if (node.type?.name === 'htmlBlock' && typeof node.attrs?.html === 'string') {
      for (const p of collectHtmlBlockParams(node.attrs.html)) mergeTemplateParam(params, p);
    }
    return true;
  });
  return [...params.values()];
}
