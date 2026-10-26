// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editor-only filler of an empty flow (the page's end, an empty cell),
// stripped before persist. Not an atom: as `inline*` it reuses ProseMirror's
// text input (composition, paste), and PlaceholderAutoParagraph turns it into
// a paragraph as soon as it holds text.
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { ViewMutationRecord } from '@tiptap/pm/view';
import * as m from '$lib/paraglide/messages';
import { placeholderMenuTarget } from './placeholderOps';

type N = any;

export const Placeholder = Node.create({
  name: 'placeholder',
  group: 'block',
  content: 'inline*',
  selectable: true,

  // false in the phone editor, which has no Insert menu: no "+", but typing still works.
  addOptions() {
    return { interactive: true };
  },

  parseHTML() {
    return [{ tag: 'div[data-placeholder-block]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-placeholder-block': '' }), 0];
  },

  addKeyboardShortcuts() {
    // A node's shortcuts register globally, so this checks the selection is in
    // a placeholder, or it would swallow every Enter in the document.
    return {
      Enter: ({ editor }: { editor: N }) => editor.state.selection.$from.parent.type.name === 'placeholder',
    };
  },

  addNodeView() {
    const interactive = this.options.interactive;
    return ({ node, getPos }: N) => {
      const dom = document.createElement('div');
      dom.className = 'ph-row';
      if (node.attrs.blockId) dom.setAttribute('data-block-id', node.attrs.blockId);

      // The "+" goes on the left: on the right it would sit under the block
      // tools (CanvasOverlay.svelte) and steal their clicks.
      if (interactive) {
        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'ph-plus';
        plus.contentEditable = 'false';
        plus.setAttribute('aria-label', m.editor_placeholder_insert_aria());
        plus.textContent = '+';
        // Keep the click from starting a selection or stealing focus.
        plus.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        plus.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (pos == null) return;
          placeholderMenuTarget.set({ pos, rect: plus.getBoundingClientRect() });
        });
        dom.appendChild(plus);
      }

      // Set by the view, not `:empty`: ProseMirror keeps a <br> in an empty
      // text block. It only ever holds text during a composition.
      const contentDOM = document.createElement('div');
      contentDOM.className = 'ph-content';
      contentDOM.dataset.hint = m.editor_placeholder_hint();
      const showHint = (n: N) => contentDOM.toggleAttribute('data-empty', n.childCount === 0);
      showHint(node);
      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM,
        update: (updated: N) => {
          if (updated.type.name !== 'placeholder') return false;
          showHint(updated);
          return true;
        },
        // The hint's attribute is the view's own, not an edit of the content.
        ignoreMutation: (mutation: ViewMutationRecord) => mutation.type === 'attributes' && mutation.target === contentDOM,
        stopEvent: (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('.ph-plus'),
      };
    };
  },
});

// appendTransaction runs in the keystroke's own cycle, so the promotion is
// part of the same undo step.
export const PlaceholderAutoParagraph = Extension.create({
  name: 'placeholderAutoParagraph',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('placeholderAutoParagraph'),
        appendTransaction(transactions: readonly N[], _oldState: N, newState: N) {
          if (!transactions.some((t) => t.docChanged)) return null;
          // Replacing the node mid-composition would break the input method.
          if (editor.view?.composing) return null;
          let tr: N = null;
          newState.doc.descendants((node: N, pos: number) => {
            if (node.type.name === 'placeholder' && node.content.size > 0) {
              const para = newState.schema.nodes.paragraph.create({ blockId: node.attrs.blockId }, node.content);
              tr = (tr ?? newState.tr).replaceWith(pos, pos + node.nodeSize, para);
            }
          });
          if (!tr) return null;
          const mapped = tr.mapping.map(newState.selection.head);
          return tr.setSelection(TextSelection.near(tr.doc.resolve(mapped), -1));
        },
      }),
    ];
  },
});
