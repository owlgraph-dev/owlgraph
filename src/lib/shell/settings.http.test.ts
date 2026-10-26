// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { PLUGINS_WITH_SETTINGS } from '$lib/plugins';
import { call, startApp, type ServedApp } from '$tests/integration/http';
import type { Role } from '$tests/integration/users';
import { SETTINGS_TREE } from './settings/tree';

// What the search and the phone sheet do in a browser is the component and e2e
// layers'.

const app = await startApp();

const NAV = 'nav[aria-label="Settings sections"]';
const PERSONAL = ['Overview', 'Profile', 'API tokens', 'Connections'];

afterAll(async () => {
  if (!app.skipped) await app.close();
});

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';

async function page(served: ServedApp, path: string, role: Role, status = 200) {
  const res = await call(served, path, { as: role });
  expect(res.status, `${role}: GET ${path}`).toBe(status);
  const html = await res.text();
  return { html, document: new JSDOM(html).window.document };
}

/** Each group's list, by the group label that names it. */
function sidebarGroups(document: Document): Map<string, Element> {
  const nav = document.querySelector(NAV);
  expect(nav, 'the settings navigation').toBeTruthy();
  const groups = new Map<string, Element>();
  for (const list of nav!.querySelectorAll('ul[aria-labelledby]')) groups.set(text(document.getElementById(list.getAttribute('aria-labelledby')!)), list);
  return groups;
}

describe.skipIf(app.skipped)('settings — admin sees every group', () => {
  const served = app as ServedApp;

  it('the sidebar lists all groups and the overview mirrors them', async () => {
    const { document } = await page(served, '/settings', 'admin');
    const groups = sidebarGroups(document);
    for (const group of ['Personal', 'Content', 'Appearance', 'Structure', 'Semantic schema', 'Access']) expect(groups.has(group), group).toBe(true);
    const overview = [...document.querySelectorAll(`${NAV} a`)].find((a) => text(a) === 'Overview');
    expect(overview?.getAttribute('aria-current')).toBe('page');

    // The overview pane links every section of the tree.
    const pane = document.querySelector('.settings-pane')!;
    expect([...pane.querySelectorAll('h2')].map(text)).toContain('Access');
    expect([...pane.querySelectorAll('a')].some((a) => /Users/.test(text(a)))).toBe(true);
    const hrefs = [...pane.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(new Set(hrefs)).toEqual(new Set(SETTINGS_TREE.flatMap((g) => g.items.map((i) => i.href))));
  });

  it('the integrations group holds a section per plugin with settings, and is absent without one', async () => {
    const { document } = await page(served, '/settings', 'admin');
    const group = sidebarGroups(document).get('Integrations');
    if (PLUGINS_WITH_SETTINGS.length === 0) expect(group).toBeUndefined();
    for (const plugin of PLUGINS_WITH_SETTINGS) {
      const link = [...(group?.querySelectorAll('a') ?? [])].find((a) => text(a) === plugin.label());
      expect(link?.getAttribute('href'), plugin.id).toBe(`/settings/integrations/${plugin.id}`);
    }
    expect((await call(served, '/settings/integrations/no-such-plugin', { as: 'admin' })).status).toBe(404);
  });
});

describe.skipIf(app.skipped)('settings — editor sees only the personal group', () => {
  const served = app as ServedApp;

  it('the sidebar and overview hide every gated section', async () => {
    const { document } = await page(served, '/settings', 'editorA');
    expect([...document.querySelectorAll(`${NAV} a`)].map(text)).toEqual(PERSONAL);
    const pane = document.querySelector('.settings-pane')!;
    expect([...pane.querySelectorAll('a')].filter((a) => /Branding/.test(text(a)))).toHaveLength(0);
    expect([...pane.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/settings/profile', '/settings/api-tokens', '/settings/connections']);
  });

  it('a hidden section is still forbidden on GET and on a direct POST', async () => {
    for (const path of ['/settings/users', '/settings/navigation', '/settings/home', '/settings/branding', '/settings/schema/groups', '/settings/namespaces', '/settings/integrations/no-such-plugin']) {
      expect((await call(served, path, { as: 'editorA' })).status, path).toBe(403);
    }
    // Posted as a form without JavaScript does, not an enhanced one.
    const upload = await call(served, '/settings/branding?/upload', { as: 'editorA', body: new FormData() });
    expect(upload.status).toBe(403);
    const create = await call(served, '/settings/users?/create', { as: 'editorA', body: new URLSearchParams({ email: 'x@y', password: 'p', role: 'admin' }) });
    expect(create.status).toBe(403);
    expect(await db`select 1 from users where email = 'x@y'`).toHaveLength(0);
  });

  it('the personal sections open', async () => {
    for (const [path, heading] of [['/settings/profile', 'Profile'], ['/settings/api-tokens', 'API tokens'], ['/settings/connections', 'Connections']]) {
      const { document } = await page(served, path, 'editorA');
      expect([...document.querySelectorAll('h1')].map(text), path).toEqual([heading]);
    }
  });
});

describe.skipIf(app.skipped)('settings — viewer', () => {
  const served = app as ServedApp;

  it('can open the personal sections and nothing else', async () => {
    expect((await call(served, '/settings/profile', { as: 'viewer' })).status).toBe(200);
    expect((await call(served, '/settings/connections', { as: 'viewer' })).status).toBe(200);
    expect((await call(served, '/settings/schema/properties', { as: 'viewer' })).status).toBe(403);
  });
});

describe.skipIf(app.skipped)('the settings leaf', () => {
  const served = app as ServedApp;

  // The settings have no footer, so any mention of the page is the leaf. The
  // search reads the permissions in the page's data.
  for (const role of ['editorA', 'viewer'] as const) {
    describe(role, () => {
      it('sees no About leaf — not in the sidebar, the overview or the search', async () => {
        const { html, document } = await page(served, '/settings', role);
        expect(document.querySelector(NAV)).toBeTruthy();
        expect(document.querySelectorAll('a[href="/-/about"]')).toHaveLength(0);
        // The document template's comments name the page; they are neither markup nor data.
        const markup = html.replace(/<!--[\s\S]*?-->/g, '');
        expect(markup).not.toContain('/-/about');
        expect(markup).not.toContain('installation:view');
      });
    });
  }

  it("is in an admin's sidebar, overview and permissions — the control the others' absence is measured against", async () => {
    const { html, document } = await page(served, '/settings', 'admin');
    expect(document.querySelectorAll(`${NAV} a[href="/-/about"]`)).toHaveLength(1);
    expect(document.querySelectorAll('.settings-pane a[href="/-/about"]')).toHaveLength(1);
    expect(html).toContain('installation:view');
  });
});

describe.skipIf(app.skipped)('the footer editor', () => {
  const served = app as ServedApp;

  it('shows the software notice as a fixed part of the legal line, with nothing to edit or remove', async () => {
    const { document } = await page(served, '/settings/footer', 'admin');
    const legal = document.querySelector('section.legal-section');
    expect(legal, 'the legal section').toBeTruthy();
    const row = [...legal!.querySelectorAll('[role="group"]')].find((g) => text(document.getElementById(g.getAttribute('aria-labelledby') ?? '')) === 'Software notice');
    expect(row, 'the Software notice row').toBeTruthy();
    expect([...row!.querySelectorAll('*')].some((el) => text(el) === 'Always visible')).toBe(true);
    expect(row!.querySelectorAll('a, button, input, select, textarea, form, [role=switch], [role=button]')).toHaveLength(0);
  });
});
