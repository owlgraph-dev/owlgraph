// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the formatting controls show and write: the active marks and nodes,
// the typography fields with the arbitration between a block's own values and
// marks on its text, the named style and the paragraph style. The core
// refreshes it after every transaction. Public methods are arrow fields.
import { getMarkRange, type Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { markFieldState, listApplicableCustomStyles, type CustomStyleRef } from '$lib/features/content';
import { applyParagraphStyle, resolveParagraphStyle, sortParagraphStyles, getTypographyRegistry, type ResolvedParagraphStyle } from '$lib/features/content';
import { getMarkFieldStates, type SelectionChainEntry } from '$lib/features/content/editor';
import { setTypographyField, resolvedColor, sizeOrNull, blockSupportsCapability, typographyColorWarningText, type TypeSize, type WeightToken, type Tier, type ContentScheme } from '$lib/features/content';
import { setAttrsAt } from '../commands/attrs';
import type { SelectionState } from './selection.svelte';

export type TypographyFieldName = 'family' | 'size' | 'color' | 'weight' | 'lineHeight' | 'letterSpacing';

const MARK_NAMES = {
  family: 'typographyFamily',
  size: 'typographySize',
  color: 'typographyColor',
  weight: 'typographyWeight',
  lineHeight: 'typographyLineHeight',
  letterSpacing: 'typographyLetterSpacing',
} as const;

export class FormatState {
  #editor: () => Editor | undefined;
  #selection: SelectionState;
  #tier: () => Tier;

  active = $state({ italic: false, code: false, heading: false, bullet: false, ordered: false });

  /** Whether text inside the typography target carries a colour of its own (a mark) — "Default" there clears it too. */
  inlineColors = $state(false);
  isNodeSelection = $state(false);
  markValue = $state<{ family: string | null; size: TypeSize | null; color: string | null; weight: WeightToken | null; lineHeight: number | null; letterSpacing: number | null }>({
    family: null,
    size: null,
    color: null,
    weight: null,
    lineHeight: null,
    letterSpacing: null,
  });
  markMixed = $state({ family: false, size: false, color: false, weight: false, lineHeight: false, letterSpacing: false });
  /** The named style over the selection, null when none — or when mixed. */
  customStyleId = $state<string | null>(null);
  customStyleMixed = $state(false);

  // The paragraph style every text block in the range resolves to; null when
  // they differ or none is in range.
  paragraphStyleId = $state<string | null>(null);

  // A text range writes marks; a caret or a NodeSelection writes the selected
  // node's attrs, and a selected cell sets the default its children inherit.
  // Set by refresh(): it reads the editor's selection, which no rune tracks.
  blockScope = $state(false);
  boldActive: boolean;
  colorSwatch: string;
  sizeValue: TypeSize | '';

  /** `tier` is the tier being edited. */
  constructor(editor: () => Editor | undefined, selection: SelectionState, tier: () => Tier) {
    this.#editor = editor;
    this.#selection = selection;
    this.#tier = tier;
    this.boldActive = $derived(
      this.blockScope && this.#selection.textTarget
        ? this.#selection.textTarget.attrs.typography?.[this.#tier()]?.weight === 'bold'
        : !this.markMixed.weight && this.markValue.weight === 'bold'
    );
    this.colorSwatch = $derived(
      this.blockScope && this.#selection.textTarget
        ? resolvedColor(this.#selection.textTarget.attrs.typography, this.#tier())
        : this.markMixed.color
          ? ''
          : (this.markValue.color ?? '')
    );
    this.sizeValue = $derived(
      this.blockScope && this.#selection.textTarget
        ? (sizeOrNull(this.#selection.textTarget.attrs.typography?.[this.#tier()]?.size) ?? '')
        : this.markMixed.size
          ? ''
          : (sizeOrNull(this.markValue.size) ?? '')
    );
  }

  /** Reads the marks, styles and typography at the selection; `target` is the selection's text target. */
  refresh = (editor: Editor, target: SelectionChainEntry | null) => {
    this.active = {
      italic: editor.isActive('italic'),
      code: editor.isActive('codeBlock'),
      heading: editor.isActive('heading'),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
    };
    const isNodeSelection = editor.state.selection instanceof NodeSelection;
    this.isNodeSelection = isNodeSelection;
    const typoState = getMarkFieldStates(editor);
    this.markValue = typoState.value;
    this.markMixed = typoState.mixed;
    // A range spanning two named styles reports neither, so the picker shows mixed.
    const { from, to } = editor.state.selection;
    const styleState = markFieldState(editor, from, to, 'customStyle', 'styleId');
    this.customStyleId = (styleState.value as string | null) ?? null;
    this.customStyleMixed = styleState.mixed;
    const styles = getTypographyRegistry().paragraphStyles;
    const seen = new Set<string | null>();
    editor.state.doc.nodesBetween(from, to, (node) => {
      const name = node.type.name;
      if (name !== 'heading' && name !== 'paragraph') return !node.isTextblock;
      seen.add(resolveParagraphStyle(name, node.attrs, styles).style?.id ?? null);
      return false;
    });
    this.paragraphStyleId = seen.size === 1 ? [...seen][0] : null;
    this.inlineColors = target ? this.#hasInlineColor(editor.state.doc, target.pos) : false;
    this.blockScope = !!target && blockSupportsCapability(editor, target.type, 'typography') && (isNodeSelection || editor.state.selection.empty);
  };

  /** Whether the typography colour reads on its background (contrastGuidance.ts), in the canvas's scheme. */
  colorWarning = (scheme: ContentScheme): string | null =>
    typographyColorWarningText({
      chain: this.#selection.chain,
      selectedIndex: this.#selection.index,
      blockScope: this.blockScope,
      markColor: this.markValue.color,
      bp: this.#tier(),
      scheme,
    });

  #hasInlineColor(doc: any, pos: number): boolean {
    const node = doc.nodeAt(pos);
    if (!node) return false;
    let found = false;
    node.descendants((child: any) => {
      if (found) return false;
      if (child.isText && child.marks.some((mk: any) => mk.type.name === 'typographyColor')) found = true;
      return !found;
    });
    return found;
  }

  /** The selection widened to every coloured run it touches: Clear on part of a word clears the word. */
  #colorRunRanges(state: any): { from: number; to: number }[] {
    const type = state.schema.marks.typographyColor;
    const ranges: { from: number; to: number }[] = state.selection.ranges.map((r: any) => ({ from: r.$from.pos, to: r.$to.pos }));
    for (const range of [...ranges]) {
      state.doc.nodesBetween(range.from, range.to, (node: any, pos: number) => {
        if (!node.isText || !type.isInSet(node.marks)) return;
        const run = getMarkRange(state.doc.resolve(pos), type);
        if (run) ranges.push(run);
      });
    }
    return ranges;
  }

  #setMarkField = (field: TypographyFieldName, value: string | number | null) => {
    const editor = this.#editor();
    if (!editor) return;
    const name = MARK_NAMES[field];
    // No focus(): these controls sit in a popover with a focus trap. Tiptap
    // focuses a frame later, the trap pulls focus back, the field blurs with a
    // half-typed value, and a key can land in the editor over the selection.
    const chain = editor.chain();
    // Stored validated, like the block capability's: a step ref or a clamped px.
    const stored = field === 'size' ? sizeOrNull(value) : value;
    if ((stored == null || stored === '') && field === 'color') {
      const { state, view } = editor;
      const tr = state.tr;
      for (const range of this.#colorRunRanges(state)) tr.removeMark(range.from, range.to, state.schema.marks.typographyColor);
      view.dispatch(tr);
    } else if (stored == null || stored === '') chain.unsetMark(name).run();
    else chain.setMark(name, { [field]: stored }).run();
  };

  /**
   * Applies a named style to the selection, or removes it with null. The
   * picker has no input of its own, so focus() restores the selection without
   * a saved range. One style per run: a mark of the same type replaces it.
   */
  setCustomStyle = (styleId: string | null) => {
    const editor = this.#editor();
    if (!editor) return;
    const chain = editor.chain().focus();
    if (styleId) chain.setMark('customStyle', { styleId }).run();
    else chain.unsetMark('customStyle').run();
  };

  customStyleOptions = (): readonly CustomStyleRef[] => listApplicableCustomStyles();

  /**
   * Every text block in the selection takes the paragraph style's tag and
   * records its id: one write for structure and look (docs/architecture/typography.md).
   */
  setParagraphStyle = (styleId: string) => {
    const editor = this.#editor();
    if (!editor) return;
    const style = getTypographyRegistry().paragraphStyles.find((s) => s.id === styleId);
    if (!style) return;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => applyParagraphStyle(tr, state.selection.from, state.selection.to, style))
      .run();
  };

  paragraphStyleOptions = (): ResolvedParagraphStyle[] => sortParagraphStyles(getTypographyRegistry().paragraphStyles);

  // Every typography control writes here, routed by the same arbitration
  // that decides what they display.
  setField = (field: TypographyFieldName, value: string | number | null) => {
    const editor = this.#editor();
    if (!editor) return;
    const target = this.#selection.textTarget;
    if (this.blockScope && target) {
      const typography = setTypographyField(target.attrs.typography, this.#tier(), field, value);
      if (field === 'color' && (value == null || value === '')) {
        // Default is the colour the background gives the text: the block's
        // colour and every colour on text inside it go, in one undo step.
        const { state, view } = editor;
        const node = state.doc.nodeAt(target.pos);
        if (!node) return;
        const tr = state.tr.setNodeMarkup(target.pos, undefined, { ...node.attrs, typography });
        tr.removeMark(target.pos + 1, target.pos + node.nodeSize - 1, state.schema.marks.typographyColor);
        view.dispatch(tr);
        return;
      }
      // Writes to the selected node itself, not to the cell around it.
      setAttrsAt(editor, target.pos, { typography });
    } else {
      this.#setMarkField(field, value);
    }
  };

  // A toolbar button, not a popover, so it may focus: typing goes on after it.
  toggleBold = () => {
    this.setField('weight', this.boldActive ? null : 'bold');
    this.#editor()?.commands.focus();
  };
}
