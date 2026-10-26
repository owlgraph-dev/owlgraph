// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { authState } from '../seed-data';
import { createPage, unique } from '../api';
import { doc, txt } from '../doc';
import { db } from '../../../src/lib/platform/db.server';
import { posting } from '../api';

// The woff2 signature and padding: what the upload checks (fonts.http.test.ts).
// The browser cannot draw it, so the page names the family and falls back.
const WOFF2 = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]);

const HEADING = 'A heading in the h2 style';
const LEAD = 'Lead words in a named style.';
const FACE = 'A paragraph in the uploaded face.';

interface Caret {
  /** The text of the block the caret is in. */
  block: string;
  /** The selected text; empty for a caret. */
  selected: string;
  atStart: boolean;
}

/** The editor's own selection (tests/e2e/editor.ts): what the toolbar acts on. */
function caret(editor: Locator): Promise<Caret> {
  return editor.evaluate((el) => {
    type State = { selection: { from: number; to: number; $from: { parentOffset: number; parent: { textContent: string } } }; doc: { textBetween(from: number, to: number): string } };
    const { state } = (el as unknown as { editor: { state: State } }).editor;
    const { $from, from, to } = state.selection;
    return { block: $from.parent.textContent, selected: state.doc.textBetween(from, to), atStart: $from.parentOffset === 0 };
  });
}

/** The caret into the block that reads `text`, once the editor holds it there: it settles a click's selection after the mouse events. */
async function caretInto(page: Page, text: string) {
  const editor = page.locator('.ProseMirror');
  await expect(async () => {
    await editor.getByText(text, { exact: true }).click();
    expect((await caret(editor)).block).toBe(text);
  }).toPass({ timeout: 10_000 });
}

/** The token card named `name`: its name is an input's value property, so it is read, not matched. */
async function tokenCard(page: Page, name: string): Promise<Locator> {
  let found!: Locator;
  await expect(async () => {
    for (const card of await page.locator('.token-card').all()) {
      if ((await card.locator('input[name="name"]').inputValue()) === name) {
        found = card;
        return;
      }
    }
    throw new Error(`no token card named "${name}" yet`);
  }).toPass({ timeout: 15_000 });
  return found;
}

test.describe('styling the content', () => {
  // Fonts, text styles and stylesheets style every page, so this runs alone.
  test.use({ storageState: { cookies: [], origins: [] }, siteWide: true });

  const names = () => ({ family: unique('Journey Face').name, token: unique('Journey H2').name, sheet: unique('Journey sheet').name, style: unique('Journey aside') });
  let n = names();

  test.afterEach(async () => {
    // Through the database, so a test failed halfway leaves every page as it was.
    await db`delete from typography_tokens where name = ${n.token}`;
    await db`delete from stylesheets where name = ${n.sheet}`;
    await db`delete from assets where id in (select v.asset_id from font_variants v join font_families f on f.id = v.family_id where f.name = ${n.family})`;
    await db`delete from font_families where name = ${n.family}`;
  });

  test('an admin uploads a font, gives the h2 style a token and adds a named style; an editor applies them, and the page shows them', async ({ page: reader, browser }) => {
    test.setTimeout(120_000);
    n = names();
    // slugFromLabel (site/customStyles/slug.ts): the class the style renders as.
    const styleClass = `cs-${n.style.slug}`;

    const adminContext = await browser.newContext({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });
    const editorContext = await browser.newContext({ storageState: authState('editorA'), viewport: { width: 1280, height: 900 } });
    try {
      const admin = await adminContext.newPage();

      await test.step('an admin uploads a font family', async () => {
        await admin.goto('/settings/fonts');
        // The open dialog's footer carries a button of the same name.
        await admin.getByRole('button', { name: 'Add family' }).first().click();
        const dialog = admin.getByRole('dialog');
        await dialog.getByLabel('Family name').fill(n.family);
        await dialog.getByRole('button', { name: 'Add family' }).click();
        await expect(dialog).toBeHidden();
        const card = admin.locator('.family', { has: admin.getByRole('heading', { name: n.family }) });
        await card.locator('input[type="file"]').setInputFiles({ name: 'face.woff2', mimeType: 'font/woff2', buffer: WOFF2 });
        await posting(admin, 'addVariant', () => card.getByRole('button', { name: 'Add variant' }).click());
        await expect(card.getByText('400 · Normal')).toBeVisible();
      });

      await test.step('they make a type token and give it to the h2 style', async () => {
        await admin.goto('/settings/branding');
        await admin.getByLabel('Token name').fill(n.token);
        await admin.getByRole('button', { name: 'Add token' }).click();
        const card = await tokenCard(admin, n.token);
        await card.getByRole('combobox', { name: 'Size' }).click();
        await admin.getByRole('option', { name: '3xl · 1.875rem', exact: true }).click();
        await card.getByRole('combobox', { name: 'Weight' }).click();
        await admin.getByRole('option', { name: 'Bold', exact: true }).click();
        await posting(admin, 'updateTypographyToken', () => card.getByRole('button', { name: 'save' }).click());
        await expect(card.getByRole('combobox', { name: 'Size' })).toContainText('3xl');

        // Subtitle is the seeded h2 style.
        await admin.getByRole('combobox', { name: 'Token for Subtitle' }).click();
        await posting(admin, 'setParagraphStyleToken', () => admin.getByRole('option', { name: n.token }).click());
        await expect(admin.getByRole('combobox', { name: 'Token for Subtitle' })).toContainText(n.token);
      });

      await test.step('they add a stylesheet with a named style', async () => {
        await admin.goto('/settings/styles');
        await admin.getByRole('button', { name: 'Add stylesheet' }).first().click();
        const dialog = admin.getByRole('dialog');
        // getByLabel matches substrings ("Rename" holds "Name"): the fields by role, exactly.
        await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(n.sheet);
        await dialog.getByRole('button', { name: 'Save' }).click();
        await admin.getByRole('link', { name: n.sheet }).click();
        await expect(admin.getByRole('heading', { level: 1, name: n.sheet })).toBeVisible();
        await admin.getByRole('button', { name: 'Add style' }).first().click();
        await dialog.getByRole('textbox', { name: 'Label', exact: true }).fill(n.style.name);
        await expect(dialog.getByText(styleClass)).toBeVisible();
        await admin.locator('#custom-style-css').fill('font-style: italic; letter-spacing: 0.1em;');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(admin.getByRole('cell', { name: styleClass })).toBeVisible();
      });

      // A page of the editor's own that anyone may read.
      const { id, slug } = await createPage(editorContext.request, {
        visibility: null,
        title: unique('Styled page').name,
        doc: doc(...[HEADING, LEAD, FACE].map((text) => ({ type: 'paragraph', content: [txt(text)] }))),
      });
      const editor = await editorContext.newPage();
      const canvas = editor.locator('.ProseMirror');

      await test.step('an editor sets the heading in the h2 style, which takes the token', async () => {
        await editor.goto(`/${slug}/edit`);
        await caretInto(editor, HEADING);
        await editor.getByRole('button', { name: 'Paragraph style' }).click();
        await editor.getByRole('menuitem', { name: /^Subtitle\b/ }).click();
        const heading = canvas.locator('h2');
        await expect(heading).toHaveText(HEADING);
        // 3xl is 1.875rem on a wide canvas.
        await expect(heading).toHaveCSS('font-size', '30px');
        await expect(heading).toHaveCSS('font-weight', '700');
      });

      await test.step('they apply the named style to a word', async () => {
        await caretInto(editor, LEAD);
        await expect(async () => {
          await editor.keyboard.press('Home');
          expect(await caret(canvas)).toMatchObject({ block: LEAD, atStart: true, selected: '' });
        }).toPass({ timeout: 10_000 });
        await editor.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) await editor.keyboard.press('ArrowRight');
        await editor.keyboard.up('Shift');
        await expect.poll(async () => (await caret(canvas)).selected).toBe('Lead');
        await editor.getByRole('button', { name: 'Text style', exact: true }).click();
        await editor.getByRole('button', { name: new RegExp(`^${n.style.name}`) }).click();
        await expect(canvas.locator(`.${styleClass}`)).toHaveText('Lead');
        await expect(canvas.locator(`.${styleClass}`)).toHaveCSS('font-style', 'italic');
      });

      await test.step('they set a paragraph in the uploaded family', async () => {
        await caretInto(editor, FACE);
        await editor.getByRole('button', { name: 'Font family' }).click();
        // Exact: "Font size" shares the role. By keyboard: a pointer click on
        // the trigger can race the toolbar popover's outside-click check.
        const font = editor.getByRole('combobox', { name: 'Font', exact: true });
        await font.focus();
        await font.press('Enter');
        await editor.getByRole('option', { name: n.family }).click();
        await expect(canvas.getByText(FACE, { exact: true })).toHaveCSS('font-family', new RegExp(n.family));
      });

      await test.step('they save', async () => {
        const saved = editor.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${id}`);
        await editor.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await saved).ok()).toBe(true);
        await expect(editor.getByText(/^Saved /)).toBeVisible();
      });

      await test.step('a reader sees the page as the editor showed it', async () => {
        await reader.goto(`/${slug}`);
        const blocks = reader.locator('.canvas-blocks');
        const heading = blocks.getByRole('heading', { level: 2, name: HEADING });
        await expect(heading).toHaveCSS('font-size', '30px');
        await expect(heading).toHaveCSS('font-weight', '700');
        const styled = blocks.locator(`.${styleClass}`);
        await expect(styled).toHaveText('Lead');
        await expect(styled).toHaveCSS('font-style', 'italic');
        await expect(blocks.getByText(FACE, { exact: true })).toHaveCSS('font-family', new RegExp(n.family));
      });
    } finally {
      await editorContext.close();
      await adminContext.close();
    }
  });
});
