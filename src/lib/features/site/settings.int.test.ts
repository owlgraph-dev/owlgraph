// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { connectAs, jsonOf, userOf } from '$tests/integration/mcp';
import type { Role } from '$tests/integration/users';
import {
  CustomCssError,
  createCustomStyle,
  createStylesheet,
  createTreeNode,
  deleteStylesheet,
  deleteTreeNode,
  getCompiledStyles,
  getSiteTheme,
  listStylesheets,
  resetSiteThemeColors,
  resolveFooterForUser,
  resolveTreeForUser,
  saveFreeCss,
  saveSiteThemeColors,
  setStylesheetEnabled,
  type ResolvedTreeNode,
  type ThemeColorsInput,
} from './server';

// The in-process MCP server shares this file's module copy, so the feature's
// own save functions write what the agent lists. Tests share the database in
// order, so each starts from what it needs.

const seed = inject('seed');

const viewerOf = (role: Role | null) => (role ? userOf(role) : Promise.resolve(null));
const labelsOf = (tree: ResolvedTreeNode[]): string[] => tree.flatMap((n) => (n.kind === 'group' ? [n.label, ...n.children.map((c) => c.label)] : [n.label]));

const NO_COLORS: ThemeColorsInput = { accent: null, lightAccent: null, darkAccent: null, appbarLight: null, appbarDark: null, footerLight: null, footerDark: null, brand: [] };

async function removeStylesheets() {
  for (const sheet of await listStylesheets()) await deleteStylesheet(sheet.id);
}

describe('the nav tree a viewer is served', () => {
  it('loses a deleted entry, for every viewer', async () => {
    const entry = await createTreeNode('nav', { kind: 'link', label: 'Deleted Nav Page', targetType: 'page', targetPageId: seed.publicId });
    const viewers: (Role | null)[] = ['admin', 'viewer', null];
    for (const role of viewers) expect(labelsOf(await resolveTreeForUser('nav', await viewerOf(role))), role ?? 'anonymous').toContain('Deleted Nav Page');

    await deleteTreeNode(entry.id);
    expect(await db`select 1 from nav_tree_entries where id = ${entry.id}`).toHaveLength(0);
    for (const role of viewers) expect(labelsOf(await resolveTreeForUser('nav', await viewerOf(role))), role ?? 'anonymous').not.toContain('Deleted Nav Page');
  });

  it("holds an entry pointing at a restricted page for the admin, and leaves it out of a viewer's without access", async () => {
    const entry = await createTreeNode('nav', { kind: 'link', label: 'Restricted Nav Page', targetType: 'page', targetPageId: seed.restrictedId });
    try {
      expect(await resolveTreeForUser('nav', await userOf('admin'))).toContainEqual({
        id: entry.id,
        kind: 'link',
        label: 'Restricted Nav Page',
        href: `/${seed.restrictedSlug}`,
        external: false,
      });
      expect(labelsOf(await resolveTreeForUser('nav', await userOf('viewer')))).not.toContain('Restricted Nav Page');
      expect(labelsOf(await resolveTreeForUser('nav', null))).not.toContain('Restricted Nav Page');
    } finally {
      await deleteTreeNode(entry.id);
    }
  });
});

describe('the footer a viewer is served', () => {
  const columnsOf = async (role: Role | null) => (await resolveFooterForUser(await viewerOf(role))).columns;

  it('loses a deleted column and its links with it', async () => {
    const column = await createTreeNode('footer', { kind: 'group', label: 'Deleted Column' });
    const link = await createTreeNode('footer', { kind: 'link', label: 'Deleted Column Link', targetType: 'page', targetPageId: seed.publicId, parentId: column.id });
    expect(labelsOf(await columnsOf('viewer'))).toEqual(['Deleted Column', 'Deleted Column Link']);

    await deleteTreeNode(column.id);
    expect(await db`select 1 from nav_tree_entries where id = ${link.id}`).toHaveLength(0);
    for (const role of ['viewer', 'admin'] as const) expect(await columnsOf(role), role).toEqual([]);
  });

  it("holds a link to a restricted page for the admin, and leaves it out of a viewer's, dropping its column left without links", async () => {
    const column = await createTreeNode('footer', { kind: 'group', label: 'Visibility Column' });
    const link = await createTreeNode('footer', { kind: 'link', label: 'Restricted Footer Link', targetType: 'page', targetPageId: seed.restrictedId, parentId: column.id });
    try {
      expect(await columnsOf('admin')).toEqual([
        {
          id: column.id,
          kind: 'group',
          label: 'Visibility Column',
          children: [{ id: link.id, kind: 'link', label: 'Restricted Footer Link', href: `/${seed.restrictedSlug}`, external: false }],
        },
      ]);
      for (const role of ['viewer', null] as const) expect(await columnsOf(role), role ?? 'anonymous').toEqual([]);
    } finally {
      await deleteTreeNode(column.id);
    }
  });
});

describe('free CSS the compiler refuses', () => {
  it('is answered with an error for the field and never stored, so no artifact exists', async () => {
    await removeStylesheets();
    const { id } = await createStylesheet('Refused');
    try {
      const refused = await saveFreeCss(id, '@import url("/evil.css");').catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(CustomCssError);
      expect((refused as CustomCssError).issues.map((issue) => issue.message).join('\n')).toContain('is not allowed');

      const [row] = await db<{ free_css: string }[]>`select free_css from stylesheets where id = ${id}`;
      expect(row.free_css).toBe('');
      expect(await getCompiledStyles()).toBeNull();
    } finally {
      await deleteStylesheet(id);
    }
  });
});

describe('the colours save', () => {
  it("refuses a hand-set light accent that misses contrast, answering the shortfall, and stores no theme", async () => {
    await resetSiteThemeColors();
    const result = await saveSiteThemeColors({ ...NO_COLORS, lightAccent: '#ffd400' });
    expect('errors' in result && result.errors.lightAccent).toBe('contrast');
    const shortfalls = 'errors' in result ? (result.errors.shortfalls?.light ?? []) : [];
    expect(shortfalls.map((s) => s.pair)).toContain('accent on bg');
    expect(await db`select 1 from themes where scope_kind = 'site'`).toHaveLength(0);
  });
});

describe("an agent's site vocabulary", () => {
  it('lists only the named styles of enabled stylesheets, and each brand colour with its token', async () => {
    await removeStylesheets();
    const enabled = await createStylesheet('Enabled sheet');
    const lead = await createCustomStyle({ stylesheetId: enabled.id, label: 'Lead', kind: 'inline', css: 'font-weight: 700;' });
    const switchedOff = await createStylesheet('Disabled sheet');
    await createCustomStyle({ stylesheetId: switchedOff.id, label: 'Hidden', kind: 'block', css: 'color: var(--content-accent);' });
    await setStylesheetEnabled(switchedOff.id, false);

    const saved = await saveSiteThemeColors({
      ...NO_COLORS,
      brand: [
        { id: null, name: 'Ocean', light: '#0B3D91', dark: '#8fb8ff' },
        { id: null, name: 'Sand', light: '#c2a878', dark: '#5a4a2e' },
      ],
    });
    expect(saved).toEqual({ ok: true });
    const brand = (await getSiteTheme()).theme.brand ?? [];
    expect(brand.map((c) => c.name)).toEqual(['Ocean', 'Sand']);

    try {
      const agent = await connectAs('viewer');
      const styles = await agent.callTool({ name: 'list_custom_styles', arguments: {} });
      expect(styles.isError).toBeFalsy();
      expect(jsonOf(styles)).toEqual([{ id: lead.id, class: 'cs-lead', label: 'Lead', kind: 'inline', stylesheet: 'Enabled sheet' }]);

      const colors = await agent.callTool({ name: 'list_brand_colors', arguments: {} });
      expect(colors.isError).toBeFalsy();
      expect(jsonOf(colors)).toEqual(brand.map((c) => ({ id: c.id, token: `token:brand.${c.id}`, name: c.name, light: c.light, dark: c.dark })));
      expect(jsonOf<{ light: string }[]>(colors)[0].light).toBe('#0b3d91');
    } finally {
      await removeStylesheets();
      await resetSiteThemeColors();
    }
  });
});
