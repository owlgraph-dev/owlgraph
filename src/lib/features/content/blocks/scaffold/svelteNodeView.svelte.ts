// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A Tiptap NodeView drawn by a Svelte component: the editor half of the
// contract in docs/architecture/blocks/anatomy.md ("Svelte leaf blocks", "Svelte container blocks").
// The NodeView owns the wrapper (blockWrapper.ts); the component renders inside
// it and gets its rule id as a prop. An attribute change updates the wrapper and
// the changed props in place, so the overlay, undo coalescing and the
// component's state survive. A `.svelte.ts` module because mount() reads props
// once and a $state proxy is how they change afterwards.
import { mount, unmount, flushSync, type Component } from 'svelte';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor, NodeViewRenderer } from '@tiptap/core';
import { getLiveStyles, type LiveStyles } from '../../capabilities/liveStyles';
import { applyWrapper, type BlockWrapper } from './blockWrapper';

export interface SvelteNodeViewContext {
  styles: LiveStyles;
  /** The view's own handle on the editor — one object for the view's life, so a prop holding it never changes. */
  view: { editor: Editor; getPos: () => number | undefined };
}

export interface SvelteNodeViewOptions<P extends Record<string, unknown>> {
  wrapper: (node: PMNode) => BlockWrapper;
  /** The full set every time; only the props that changed reach the component. */
  props: (node: PMNode, ctx: SvelteNodeViewContext) => P;
  /** Like a `{#key}`: a node whose key differs from the current one gets a fresh view. */
  key?: (node: PMNode) => string;
  /**
   * A container's content element, which the component renders empty for
   * ProseMirror to fill. Found synchronously: bind:this is an effect, too late.
   */
  content?: (root: HTMLElement) => HTMLElement;
  /**
   * A leaf's events ProseMirror must not see. Left out, that is every event
   * and a plain click selects the block; given, ProseMirror keeps the rest
   * (an atom's click selection, its native drag).
   */
  stopEvent?: (event: Event) => boolean;
  tag?: keyof HTMLElementTagNameMap;
}

// Equal for a prop: the same value, or the same plain data (a fresh array of rule ids each update).
const same = (a: unknown, b: unknown) =>
  Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));

export function svelteNodeView<P extends Record<string, unknown>>(component: Component<P>, opts: SvelteNodeViewOptions<P>): NodeViewRenderer {
  return ({ node, getPos, editor }) => {
    const styles = getLiveStyles();
    if (!styles) throw new Error('svelteNodeView: no live stylesheet — editorCore.mount registers one before the editor is built');
    const ctx: SvelteNodeViewContext = { styles, view: { editor, getPos: () => (typeof getPos === 'function' ? getPos() : undefined) } };
    let current = node;
    const wrap: HTMLElement = document.createElement(opts.tag ?? 'div');
    applyWrapper(wrap, opts.wrapper(node), styles);
    let last: Record<string, unknown> = opts.props(node, ctx);
    const props = $state({ ...last }) as P;
    const instance = mount(component, { target: wrap, props });
    const contentDOM = opts.content?.(wrap);
    // Ctrl/Cmd-click is left to the browser so a link can still open.
    if (!contentDOM && !opts.stopEvent) {
      wrap.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        const pos = ctx.view.getPos();
        if (typeof pos !== 'number') return;
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
        editor.view.focus();
      });
    }
    return {
      dom: wrap,
      contentDOM,
      update(next) {
        if (next.type !== current.type) return false;
        if (opts.key && opts.key(next) !== opts.key(current)) return false;
        // A container's update also comes for every change of its content, with the same attrs object.
        if (next.attrs !== current.attrs) applyWrapper(wrap, opts.wrapper(next), styles);
        current = next;
        const fresh: Record<string, unknown> = opts.props(next, ctx);
        const target = props as Record<string, unknown>;
        let changed = false;
        for (const key of Object.keys(last)) {
          if (key in fresh) continue;
          delete target[key]; // a cleared fill's rule id must not linger
          changed = true;
        }
        for (const [key, value] of Object.entries(fresh)) {
          if (same(last[key], value)) continue;
          target[key] = value;
          changed = true;
        }
        last = fresh;
        if (changed) flushSync(); // the DOM is current before the editor measures the selection
        return true;
      },
      ignoreMutation: contentDOM ? (m) => m.type !== 'selection' && !contentDOM.contains(m.target) : () => true,
      stopEvent: contentDOM ? undefined : (opts.stopEvent ?? (() => true)),
      destroy() {
        unmount(instance);
      },
    };
  };
}
