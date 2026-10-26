// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editing core every shell shares (docs/architecture/editor.md), so desktop and
// phone edits produce the same data by construction. Core owns what changes
// in the document; chrome owns how the UI asks for it.
//
// Public methods are arrow-function fields: chrome receives them as bare
// callback props, where a prototype method would lose its `this`.
import { Editor } from '@tiptap/core';
import { editorExtensions } from './editorExtensions';
import { preparedForEditor, readAsEditor, heldAs } from './load';
import { SelectionState } from './selection.svelte';
import { FormatState } from './format.svelte';
import { LinkInsertion } from './links.svelte';
import { PropertyMarks } from './properties.svelte';
import { collectionEmbeds, documentEmbeds } from './embeds';
import { unwrapUnknown, unknownKeys, lostKeys, type UnknownUnit } from '$lib/features/content';
import { LiveStyles, setLiveStyles, getLiveStyles } from '$lib/features/content/editor';
import { pageAttrsOf, type PageAttrs } from '$lib/features/content';
import { setBlockAttrsById, deleteBlockById, nearestInsertPos } from '$lib/features/content/editor';
import { editTier } from '$lib/features/content';
import type { Tier } from '$lib/features/content';
import { nodePath } from '$lib/features/nodes';
import { computeFirstBlockBleeds } from '$lib/features/content';
import type { JsonDoc } from '$lib/features/content';

export type MountOptions = {
  doc: unknown;
  pageId?: string;
  propSuggestions?: { name: string; label: string; datatype: string }[];
  onUploadImage?: (file: File) => Promise<{ id: string } | null>;
  // The id -> path snapshot the in-doc links' hrefs are built from: a link
  // stores only its target's id.
  pages?: Array<{ id: string; slug: string; namespaceSlug?: string | null }>;
  documents?: Array<{ id: string; slug: string; namespaceSlug?: string | null }>;
  /** Never a feature gate in core; only configures extensions that differ by input modality (no pointer-drag chrome). */
  isPhone?: boolean;
  /** Called after every refresh(), for a shell's UI-only reactions. */
  onActivity?: () => void;
};

export function createEditorCore() {
  return new EditorCore();
}

export class EditorCore {
  editor: Editor | undefined = $state();
  /**
   * The page could not be read as this editor's document (docs/architecture/blocks/anatomy.md,
   * "Unknown blocks"): no editor was made, so nothing can be saved over it.
   */
  loadFailed = $state(false);
  isPhone = false;
  onActivity: (() => void) | null = null;
  #onUploadImage: ((file: File) => Promise<{ id: string } | null>) | undefined;
  #unsubTier: () => void;

  // The tier being edited, not the mounted shell. A manual subscription:
  // `$store` syntax exists only in .svelte files.
  editTier: Tier = $state('desktop');

  // Mirrored from the live doc so the canvas drops its top padding as the
  // public view does.
  firstBlockBleeds = $state(false);

  // The page's own settings, off the doc root's attrs (pageAttrs.ts).
  page: PageAttrs = $state({ spacing: {}, layout: {}, surface: {} });

  /** The selection chain and what is selected in it. */
  selection = new SelectionState(() => this.editor, () => this.refresh());

  /** What the formatting controls show and write. */
  format = new FormatState(() => this.editor, this.selection, () => this.editTier);

  /** Inline links and quick-link cards. */
  links = new LinkInsertion(() => this.editor);

  /** Property and parameter marks, and the page's properties. */
  properties = new PropertyMarks(() => this.editor);

  constructor() {
    this.#unsubTier = editTier.subscribe((v) => {
      this.editTier = v;
    });
  }

  mount = (element: HTMLElement, opts: MountOptions) => {
    this.isPhone = opts.isPhone ?? false;
    this.#onUploadImage = opts.onUploadImage;

    const propLabelMap = new Map<string, string>(
      (opts.propSuggestions ?? []).filter((s) => s.label).map((s) => [s.name, s.label])
    );

    // A load-time snapshot, stale until the next editor load.
    const pageHrefById = new Map((opts.pages ?? []).map((p) => [p.id, nodePath(p.namespaceSlug ?? null, p.slug, { edit: true })]));
    const docHrefById = new Map((opts.documents ?? []).map((d) => [d.id, nodePath(d.namespaceSlug ?? null, d.slug)]));

    const docToLoad = preparedForEditor((opts.doc as JsonDoc | null | undefined) ?? { type: 'doc', content: [] });

    const extensions = editorExtensions({
      pageId: opts.pageId ?? null,
      interactive: !this.isPhone,
      resolvePageHref: (id: string) => pageHrefById.get(id) ?? '#',
      resolveDocHref: (id: string) => docHrefById.get(id) ?? '#',
      propLabel: (name: string) => propLabelMap.get(name) ?? null,
      embeds: { collections: collectionEmbeds, documents: documentEmbeds },
    });
    // Read first with Tiptap's schema: where that fails Tiptap opens the page
    // empty and the next save would store it empty, so no editor is made.
    const expected = readAsEditor(extensions, docToLoad);
    if (!expected) {
      this.loadFailed = true;
      return;
    }

    // Before the editor exists: NodeViews are built while the content loads
    // (content/capabilities/liveStyles.ts).
    this.#liveStyles = new LiveStyles(element.ownerDocument);
    setLiveStyles(this.#liveStyles);

    collectionEmbeds.reset();
    documentEmbeds.reset();

    this.editor = new Editor({
      element,
      extensions,
      content: docToLoad,
      editorProps: {
        attributes: { class: 'canvas-blocks' },
        // A click on an inline link places the cursor, so linked text stays
        // editable; Ctrl/Cmd-click opens it in a new tab.
        handleDOMEvents: {
          click: (_view, event) => {
            const link = (event.target as HTMLElement | null)?.closest?.('a.page-link, a.doc-link') as HTMLAnchorElement | null;
            if (!link) return false;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) window.open(link.href, '_blank', 'noopener');
            return false;
          },
        },
        handlePaste: (_view, event) => {
          const img = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
          if (img) {
            void this.insertUploadedImage(img);
            return true;
          }
          return false;
        },
        handleDrop: (_view, event) => {
          const img = Array.from((event as DragEvent).dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
          if (img) {
            event.preventDefault();
            void this.insertUploadedImage(img);
            return true;
          }
          return false;
        },
      },
    });

    // Should it hold less than was read all the same, it is closed again.
    if (this.editor.state.doc.content.size !== expected.content.size) {
      this.editor.destroy();
      this.editor = undefined;
      this.loadFailed = true;
      return;
    }

    const handleActivity = (payload?: { transaction?: { getMeta: (key: string) => unknown } }) => {
      const keep = payload?.transaction?.getMeta('keepSelected');
      this.refresh(typeof keep === 'number' ? keep : null);
      this.properties.refresh();
      this.onActivity?.();
    };
    this.editor.on('focus', handleActivity);
    this.editor.on('selectionUpdate', handleActivity);
    this.editor.on('update', handleActivity);
    this.editor.on('update', this.#schedulePrune);
    this.refresh();
    this.properties.refresh();
    this.markSaved(this.docJSON());
  };

  #liveStyles: LiveStyles | null = null;
  #pruneTimer: ReturnType<typeof setTimeout> | null = null;
  // Never inside a transaction: a view created later asks for its set again
  // and gets the same id back, so pruning cannot strand one.
  #schedulePrune = () => {
    if (this.#pruneTimer) clearTimeout(this.#pruneTimer);
    this.#pruneTimer = setTimeout(() => {
      this.#pruneTimer = null;
      if (this.editor && this.#liveStyles) this.#liveStyles.prune(this.editor.view.dom);
    }, 300);
  };

  // A lost edit lock offers to reconcile only unsaved work.
  #savedJson = '';
  // Counted from what the editor loaded, not what it was given: a block that
  // never reached the editor is never acknowledged as deleted.
  #storedUnknown = new Map<string, UnknownUnit>();

  /** Records the document a save just stored (or the editor loaded). */
  markSaved = (json: JsonDoc) => {
    this.#savedJson = JSON.stringify(json);
    this.#storedUnknown = unknownKeys(json);
  };

  /**
   * The unknown blocks the author deleted since the last load or save, by
   * key: what a save of `json` may remove (pages/unknownGuard.ts).
   */
  removedUnknown = (json: JsonDoc): string[] => lostKeys(this.#storedUnknown, unknownKeys(json));

  isDirty = (): boolean => !!this.editor && JSON.stringify(this.docJSON()) !== this.#savedJson;

  /**
   * The document as it is to be stored, each unknown block written back as
   * the node it stands for. Whatever takes the document away reads this,
   * never the editor's own JSON, which holds the stand-ins.
   */
  docJSON = (): JsonDoc => unwrapUnknown((this.editor?.getJSON() ?? { type: 'doc', content: [] }) as JsonDoc);

  /**
   * A document as this editor would hold it, every omitted attribute at its
   * default, so a stored page compares with the editor's block by block
   * (pages/pageDiff.ts). As it came when this editor cannot read it.
   */
  heldJSON = (doc: unknown): unknown => {
    const schema = this.editor?.schema;
    if (!schema || !doc || typeof doc !== 'object') return doc;
    return heldAs(schema, doc);
  };

  destroy = () => {
    if (this.#pruneTimer) clearTimeout(this.#pruneTimer);
    this.#pruneTimer = null;
    this.editor?.destroy();
    if (this.#liveStyles && getLiveStyles() === this.#liveStyles) setLiveStyles(null);
    this.#liveStyles?.dispose();
    this.#liveStyles = null;
    this.#unsubTier();
  };

  // Everything the chrome reads off the document and the selection, after
  // every transaction and after a write that may fire none.
  refresh = (keepPos: number | null = null) => {
    const editor = this.editor;
    if (!editor) return;
    const first = editor.state.doc.firstChild;
    this.firstBlockBleeds = computeFirstBlockBleeds(first?.type.name ?? null, first?.attrs ?? null);
    this.page = pageAttrsOf(editor.state.doc);
    this.format.refresh(editor, this.selection.refresh(editor, keepPos));
  };

  removeSelectedBlock = () => {
    if (this.editor && this.selection.selected) deleteBlockById(this.editor, this.selection.selected.id);
  };

  updateSelectedAttr = (attr: string, value: unknown) => {
    if (!this.editor || !this.selection.selected) return;
    setBlockAttrsById(this.editor, this.selection.selected.id, { [attr]: value });
    this.refresh();
  };

  // The doc root has no position for setNodeMarkup, hence DocAttrStep; still
  // an ordinary, undoable edit.
  setPageAttr = (attr: string, value: unknown) => {
    if (!this.editor) return;
    const { state, view } = this.editor;
    view.dispatch(state.tr.setDocAttribute(attr, value));
    this.refresh();
  };

  // Returns the new image's blockId: insertContent leaves the selection after
  // an atom, so `selected` isn't it. BlockId's appendTransaction has assigned
  // the id by the time this returns. nearestInsertPos, not a raw
  // insertContent, so schema-fitting can't move the image off `at`.
  insertUploadedImage = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/') || !this.#onUploadImage || !this.editor) return null;
    const res = await this.#onUploadImage(file);
    if (!res?.id) return null;
    const at = nearestInsertPos(this.editor, 'image');
    this.editor.chain().focus().insertContentAt(at, { type: 'image', attrs: { assetId: res.id, alt: '' } }).run();
    const node = this.editor.state.doc.nodeAt(at);
    return (node?.attrs.blockId as string | undefined) ?? null;
  };

  replaceSelectedWith = async (file: File) => {
    if (!file.type.startsWith('image/') || !this.#onUploadImage || !this.editor || !this.selection.selected) return;
    const id = this.selection.selected.id; // before the await: the selection may move
    const res = await this.#onUploadImage(file);
    if (res?.id) setBlockAttrsById(this.editor, id, { assetId: res.id });
    // The previous asset, now unreferenced, is collected on the next save.
  };
}
