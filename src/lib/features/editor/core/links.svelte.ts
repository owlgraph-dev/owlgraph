// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Inline links and quick-link cards: the range the link picker opened over,
// the card it retargets, and what a pick writes. Whether the picker is open is
// the chrome's. Public methods are arrow fields, as the core's are.
import type { Editor } from '@tiptap/core';
import { normalizeUrl, quickLinkTargetAttrs, type QuickLinkTarget } from '$lib/features/content';
import { setBlockAttrsById } from '$lib/features/content/editor';
import type { SitePage } from '../shared/sitePages';

export type LinkResult = { type: 'page' | 'document'; id: string; slug?: string; title: string };

export class LinkInsertion {
  // The selection when the picker opened, since focusing its input blurs the
  // editor; a pick links it, or inserts at it.
  range: { from: number; to: number } | null = $state(null);
  // The quick-link card a pick retargets instead.
  retargetId: string | null = $state(null);
  #editor: () => Editor | undefined;

  constructor(editor: () => Editor | undefined) {
    this.#editor = editor;
  }

  /** The picker opens over the selection. */
  begin = () => {
    const editor = this.#editor();
    if (!editor) return;
    // Clicking into the picker blurs the editor.
    const { from, to } = editor.state.selection;
    this.range = { from, to };
  };

  /** The picker opens for the card with this id. */
  beginRetarget = (id: string) => {
    this.retargetId = id;
  };

  /** The picker closed. */
  end = () => {
    this.range = null;
    this.retargetId = null;
  };

  applyInline = (page: { id: string; slug: string; title: string }) => {
    const editor = this.#editor();
    if (!editor || !this.range) return;
    const { from, to } = this.range;
    const attrs = { targetPageId: page.id, targetSlug: page.slug };
    if (from === to) {
      editor.chain().focus().insertContentAt(from, { type: 'text', text: page.title, marks: [{ type: 'pageLink', attrs }] }).run();
    } else {
      editor.chain().focus().setTextSelection({ from, to }).setMark('pageLink', attrs).run();
    }
  };

  applyDocInline = (doc: { id: string; title: string }) => {
    const editor = this.#editor();
    if (!editor || !this.range) return;
    const { from, to } = this.range;
    const attrs = { targetDocId: doc.id };
    if (from === to) {
      editor.chain().focus().insertContentAt(from, { type: 'text', text: doc.title, marks: [{ type: 'docLink', attrs }] }).run();
    } else {
      editor.chain().focus().setTextSelection({ from, to }).setMark('docLink', attrs).run();
    }
  };

  // A retarget keeps the card's styling.
  placeQuickLink = (t: QuickLinkTarget) => {
    const editor = this.#editor();
    if (!editor) return;
    if (this.retargetId) {
      setBlockAttrsById(editor, this.retargetId, { ...quickLinkTargetAttrs(t), label: t.label });
      this.retargetId = null;
      return;
    }
    if (!this.range) return;
    editor.chain().focus().insertContentAt(this.range.from, {
      type: 'quickLink',
      attrs: { ...quickLinkTargetAttrs(t), label: t.label, icon: null, iconPosition: 'left' },
    }).run();
  };

  insertUrlCard = (url: string) => {
    const u = normalizeUrl(url);
    this.placeQuickLink({ refType: 'url', url: u, label: u.replace(/^https?:\/\//, '').replace(/\/$/, '') });
  };

  // A site page that is no node (shared/sitePages.ts), labelled in the
  // content language, since a card's label is content.
  placeSitePage = (page: SitePage, contentLocale?: string) => {
    this.placeQuickLink({ refType: 'url', url: page.path, label: page.label(contentLocale) });
  };

  choosePick = (r: LinkResult) => {
    if (this.retargetId) {
      if (r.type === 'document') this.placeQuickLink({ refType: 'document', targetDocId: r.id, label: r.title });
      else this.placeQuickLink({ refType: 'page', targetPageId: r.id, targetSlug: r.slug ?? '', label: r.title });
      return;
    }
    if (r.type === 'document') this.applyDocInline({ id: r.id, title: r.title });
    else this.applyInline({ id: r.id, slug: r.slug ?? '', title: r.title });
  };
}
