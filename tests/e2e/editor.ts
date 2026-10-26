// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

// The editor's own selection, which the toolbar and the block settings act on: it
// follows the browser's a moment later, and a click's settles after the mouse
// events, so specs wait on it (docs/guides/testing.md, "Writing specs").
interface EditorSelectionState {
  selection: {
    from: number;
    to: number;
    $head: { parentOffset: number; parent: { content: { size: number } } };
  };
  doc: { textBetween(from: number, to: number): string };
}

export interface EditorSelection {
  /** The selected text; empty for a caret. */
  text: string;
  /** Whether the head sits at the start / the end of its block. */
  atLineStart: boolean;
  atLineEnd: boolean;
}

export function editorSelection(editor: Locator): Promise<EditorSelection> {
  return editor.evaluate((el) => {
    const { state } = (el as unknown as { editor: { state: EditorSelectionState } }).editor;
    const { from, to, $head } = state.selection;
    return {
      text: state.doc.textBetween(from, to),
      atLineStart: $head.parentOffset === 0,
      atLineEnd: $head.parentOffset === $head.parent.content.size,
    };
  });
}

/**
 * Selects `text`, which lies in one text node of the editor, through the
 * Selection API, as a drag over it would, and waits until the editor's
 * selection is it. A click or a tap and keys get there only once the click's
 * selection has settled, after the pointer events; a spec that isn't about the
 * keyboard selects this way.
 */
export async function selectText(editor: Locator, text: string): Promise<void> {
  await editor.evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(text);
      if (at < 0) continue;
      (root as HTMLElement).focus();
      getSelection()!.setBaseAndExtent(node, at, node, at + text.length);
      return;
    }
    throw new Error(`No "${text}" in a text node of the editor`);
  }, text);
  await expect.poll(async () => (await editorSelection(editor)).text).toBe(text);
}

/**
 * Steps the selection up with Escape, by the breadcrumb's names
 * (`['Paragraph', 'Cell', 'Grid']`), from what a click selected to the
 * last. A press before the click's selection settled is repeated, never doubled.
 * `ancestry` is the breadcrumb's name in the page's interface language.
 */
export async function stepUpTo(page: Page, chain: string[], ancestry = 'Block ancestry'): Promise<void> {
  const crumb = (name: string) => page.getByRole('navigation', { name: ancestry }).getByRole('button', { name, exact: true });
  await expect(crumb(chain[0])).toHaveAttribute('aria-current', 'true');
  for (let i = 1; i < chain.length; i++) {
    const from = crumb(chain[i - 1]);
    const to = crumb(chain[i]);
    await expect(async () => {
      if ((await from.getAttribute('aria-current')) === 'true') await page.keyboard.press('Escape');
      await expect(to).toHaveAttribute('aria-current', 'true', { timeout: 1000 });
    }).toPass({ timeout: 10_000 });
  }
}

/** Saves the editor's page and waits until the server has it. */
export async function savePage(page: Page, pageId: string): Promise<void> {
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
}

/** The desktop editor's block settings panel, by its name in the interface language. */
export function blockSettings(scope: Page | Locator, name = 'Block settings'): Locator {
  return scope.getByRole('complementary', { name, exact: true });
}
