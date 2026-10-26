// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Which block's Edit dialog is open and the values it works on: an html
// block's markup, a diagram's code, a query block's definition, a quick
// link's typed edge. Nothing reaches the block before Save. Public methods are
// arrow fields: the block tools and the dialogs take them as callbacks.
import type { Editor } from '@tiptap/core';
import { blockNodeById, setBlockAttrsById, collectTemplateParams } from '$lib/features/content/editor';
import type { TemplateParam } from '$lib/features/content';
import type { QueryDefinition } from '$lib/features/query';

export type QuickLinkEdge = { relationshipType: string | null; properties: Record<string, string> };

function blockInQueryTemplate(editor: Editor, id: string): boolean {
  let inside = false;
  editor.state.doc.descendants((node, pos) => {
    if (inside) return false;
    if (node.attrs?.blockId !== id) return true;
    const resolved = editor.state.doc.resolve(pos);
    for (let d = resolved.depth; d > 0; d--) {
      if (resolved.node(d).type.name === 'queryBlock') inside = true;
    }
    return false;
  });
  return inside;
}

export class BlockEdit {
  id = $state<string | null>(null);
  kind = $state<'html' | 'diagram' | 'query' | 'quickLink' | null>(null);
  value = $state('');
  // Inside a query template an html block's {{{key}}} tokens declare
  // parameters. From the block's ancestry, not the selection: the hover
  // overlay can open the editor with the selection elsewhere.
  htmlInTemplate = $state(false);
  // The named-style class picker (docs/architecture/custom-styles.md).
  classOpen = $state(false);
  classQuery = $state('');
  // The card's stored edge, which its Edit dialog starts from.
  quickLink = $state<QuickLinkEdge | null>(null);
  queryDraft = $state<QueryDefinition | null>(null);
  queryParams = $state<TemplateParam[]>([]);
  /** Whether a dialog of this is open: the editor's Escape leaves it alone. */
  open = $derived(!!this.id || this.classOpen);
  #editor: () => Editor | undefined;

  constructor(editor: () => Editor | undefined) {
    this.#editor = editor;
  }

  start = (id: string) => {
    const editor = this.#editor();
    if (!editor) return;
    const node = blockNodeById(editor, id);
    if (!node) return;
    if (node.type.name === 'htmlBlock') {
      this.kind = 'html';
      this.value = node.attrs.html ?? '';
      this.htmlInTemplate = blockInQueryTemplate(editor, id);
    } else if (node.type.name === 'diagram') {
      this.kind = 'diagram';
      this.value = node.attrs.code ?? '';
    } else if (node.type.name === 'queryBlock') {
      this.kind = 'query';
      this.queryDraft = {
        filter: node.attrs.filter ?? null,
        traversal: node.attrs.traversal ?? null,
        fromCurrentPage: node.attrs.fromCurrentPage ?? false,
        first: node.attrs.first ?? 20,
        orderBy: node.attrs.orderBy ?? null,
        format: 'template',
        mapping: node.attrs.mapping ?? null
      };
      this.queryParams = collectTemplateParams(node);
    } else if (node.type.name === 'quickLink') {
      this.kind = 'quickLink';
      this.quickLink = { relationshipType: node.attrs.relationshipType ?? null, properties: node.attrs.properties ?? {} };
    } else {
      return;
    }
    this.id = id;
  };

  /** The html or diagram dialog's Save. */
  save = () => {
    const editor = this.#editor();
    if (!editor || !this.id) return;
    if (this.kind === 'html') {
      setBlockAttrsById(editor, this.id, { html: this.value });
    } else if (this.kind === 'diagram') {
      setBlockAttrsById(editor, this.id, { code: this.value });
    }
    this.cancel();
  };

  saveQuickLink = (next: QuickLinkEdge) => {
    const editor = this.#editor();
    if (editor && this.id) setBlockAttrsById(editor, this.id, next);
    this.cancel();
  };

  saveQuery = (result: QueryDefinition) => {
    const editor = this.#editor();
    if (!editor || !this.id || this.kind !== 'query') return;
    // formatOptions is not part of QueryDefinition: the block settings edit
    // it, and this merge leaves it untouched.
    setBlockAttrsById(editor, this.id, {
      filter: result.filter,
      traversal: result.traversal,
      fromCurrentPage: result.fromCurrentPage,
      first: result.first,
      orderBy: result.orderBy,
      format: result.format,
      mapping: result.mapping,
    });
    this.cancel();
  };

  cancel = () => {
    this.id = null;
    this.kind = null;
    this.value = '';
    this.classOpen = false;
    this.classQuery = '';
    this.quickLink = null;
  };
}
