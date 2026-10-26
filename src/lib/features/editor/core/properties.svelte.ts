// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Semantic-property marks: a property's value, or a query template's
// parameter, and the page's properties read off its content. Public methods
// are arrow fields, as the core's are.
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { PARAMETER_GROUP, isParameterName } from '$lib/features/semantic';

/**
 * The page's properties in its content. Mirrors the server's
 * collectProperties: a queryBlock's marks are template parameters, not facts
 * about the page, and so is a parameter mark anywhere.
 */
export function collectPageProperties(doc: ProseMirrorNode): { name: string; value: string }[] {
  const found: { name: string; value: string }[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'queryBlock') return false;
    if (node.isText) {
      const mk = node.marks.find((x) => x.type.name === 'semanticProperty');
      if (mk && !isParameterName(mk.attrs.propName)) found.push({ name: mk.attrs.propName ?? '', value: node.text ?? '' });
    }
    return true;
  });
  return found;
}

export class PropertyMarks {
  // The semantic-property marks in the content.
  pageProperties = $state<{ name: string; value: string }[]>([]);
  // The selection when the picker opened, since focusing its input blurs the
  // editor; a shell stashes it before calling the apply methods.
  range: { from: number; to: number } | null = $state(null);
  #editor: () => Editor | undefined;

  constructor(editor: () => Editor | undefined) {
    this.#editor = editor;
  }

  refresh = () => {
    const editor = this.#editor();
    if (!editor) return;
    this.pageProperties = collectPageProperties(editor.state.doc);
  };

  applyProp = (name: string) => {
    const editor = this.#editor();
    const trimmed = name.trim();
    if (!editor || !trimmed) return;
    const range = this.range;
    const chain = editor.chain().focus();
    if (range && range.to > range.from) {
      chain.setTextSelection(range).setMark('semanticProperty', { propName: trimmed }).run();
    } else {
      chain.insertContent({ type: 'text', text: 'value', marks: [{ type: 'semanticProperty', attrs: { propName: trimmed } }] }).run();
    }
    this.refresh();
  };

  // The same mark as a query template's parameter. With nothing selected the
  // inserted text is the slot's name, a label for the slot, not a value.
  applyParam = (localName: string, paramType: string) => {
    const editor = this.#editor();
    const trimmed = localName.trim();
    if (!editor || !trimmed) return;
    const attrs = { propName: `${PARAMETER_GROUP}:${trimmed}`, paramType };
    const range = this.range;
    const chain = editor.chain().focus();
    if (range && range.to > range.from) {
      chain.setTextSelection(range).setMark('semanticProperty', attrs).run();
    } else {
      chain.insertContent({ type: 'text', text: trimmed, marks: [{ type: 'semanticProperty', attrs }] }).run();
    }
    this.refresh();
  };
}
