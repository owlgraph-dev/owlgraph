// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { db } from '$lib/platform/db.server';
import { SUPPORTED_LOCALES } from '$lib/platform/i18n/siteLocales';
import { ROLES, type Action, type Role as AuthRole, type SessionUser } from '$lib/features/auth';
import { can } from '$lib/features/auth/server';
import { pluginOrigin, sealCredential, storeConnection } from '$lib/features/pluginHost/server';
import { PLUGINS_WITH_SETTINGS } from '$lib/plugins';
import { call, createNamespace, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { userOf, type Role } from '$tests/integration/users';
import { SETTINGS_TREE } from './settings/tree';
import { activeItemId, leavesSettings, type SettingsItem } from './settings/treeModel';

// Every settings route and form action, called by each seeded role the
// permission table denies it (docs/architecture/settings.md), all derived from the route
// files and the tree. A form action runs before the load, so it must guard
// itself: a 403, with every table and the recording service untouched.

const app = await startApp();

afterAll(async () => {
  if (!app.skipped) await app.close();
});

/** A route file's route: `../../routes/settings/styles/[id]/+page.svelte` → `/settings/styles/[id]`. */
const routeOf = (file: string) => file.replace(/^\.\.\/\.\.\/routes/, '').replace(/\/\([^/]+\)/g, '').replace(/\/\+page(\.server\.ts|\.svelte)$/, '');

const PAGE_ROUTES = Object.keys(import.meta.glob('../../routes/settings/**/+page.svelte')).map(routeOf).sort();

const ACTIONS = new Map(
  Object.entries(import.meta.glob<Record<string, unknown> | undefined>('../../routes/settings/**/+page.server.ts', { eager: true, import: 'actions' }))
    .filter(([, actions]) => actions)
    .map(([file, actions]) => [routeOf(file), Object.keys(actions!).sort()] as const)
    .sort(([a], [b]) => a.localeCompare(b))
);

const TREE_ITEMS: SettingsItem[] = SETTINGS_TREE.flatMap((g) => g.items);

/** The tree item whose href is the path's longest prefix, as the sidebar matches it. */
function itemOf(path: string): SettingsItem | null {
  const id = activeItemId(SETTINGS_TREE, path);
  return TREE_ITEMS.find((i) => i.id === id) ?? null;
}

/** A personal section gates on no action: its actions are the person's own. */
const personal = (route: string) => !route.includes('[') && itemOf(route)?.action === null;

const SEEDED: Partial<Record<AuthRole, Role>> = { editor: 'editorA', viewer: 'viewer' };

/** The seeded roles the permission table denies `action`. */
function lacking(action: Action): Role[] {
  return ROLES.filter((role) => !can({ role } as SessionUser, action)).flatMap((role) => (SEEDED[role] ? [SEEDED[role]] : []));
}

function gateOf(path: string): Action {
  const item = itemOf(path);
  expect(item, `${path} belongs to a section of the settings tree`).toBeTruthy();
  expect(item!.action, `${path} is a gated section`).toBeTruthy();
  return item!.action!;
}

const PASSWORD = 'guards-sweep-password';
const TWO = { desktop: [1, 1], tablet: [1, 1], phone: [1] };
// A real 1×1 PNG (an upload is decoded and measured) and a woff2's signature.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const WOFF2 = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = () => new File([PNG], 'logo.png', { type: 'image/png' });
const woff2 = () => new File([WOFF2], 'variant.woff2', { type: 'font/woff2' });
/** In every supported language, so the site default's is there. */
const label = (text: string): Record<string, string> => Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [`label.${locale}`, text]));
const colors = (accent: string) => JSON.stringify({ accent, lightAccent: null, darkAccent: null, brand: [], footerLight: null, footerDark: null });

/** What the admin makes first; where order matters, the second of two, so a move would move it. */
const real = {
  user: '',
  namespace: '',
  page: '',
  editorsPage: '',
  group: 'guards',
  emptyGroup: 'guards-empty',
  property: 'guards:swept',
  relationship: 'guards-rel',
  nodeClass: '',
  pageClass: '',
  token: '',
  paragraphStyle: '',
  family: '',
  variant: '',
  sheet: '',
  style: '',
  preset: '',
  navEntry: '',
  /** A nav entry nested in a group, which outdenting would lift. */
  navChild: '',
  column: '',
  columnChild: '',
  legalLink: '',
};

/** The integrations' upstream: answers 404 and records every request. */
interface Recorder {
  origin: string;
  requests: string[];
  close: () => Promise<void>;
}
async function startRecorder(): Promise<Recorder> {
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The recorder did not get a port.');
  return { origin: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise<void>((done) => server.close(() => done())) };
}
let service: Recorder;

const pluginOf = (path: string) => PLUGINS_WITH_SETTINGS.find((plugin) => path === `/settings/integrations/${plugin.id}`)!;

/** Set up on, numbers at their low end; swept off, at the high end: a change a missing guard would store. */
function integrationFields(path: string, stage: 'setup' | 'sweep'): Record<string, string> {
  const fields: Record<string, string> = stage === 'setup' ? { enabled: 'on' } : { enabled: '' };
  for (const field of pluginOf(path).settings.fields) {
    fields[field.key] = field.kind === 'origin' ? service.origin : String(stage === 'setup' ? field.min : field.max);
  }
  return fields;
}

/** What a missing guard would act on; a section not listed is posted nothing. */
const FIELDS: Record<string, (action: string, path: string) => Record<string, string>> = {
  '/settings/users': () => ({ id: real.user, email: 'swept@guards.test', name: 'Swept', password: PASSWORD, role: 'admin', active: 'false' }),
  '/settings/namespaces': () => ({ id: real.namespace, name: 'Swept space', slug: 'swept-space', accessLevel: 'public', members: real.user }),
  '/settings/schema/properties': () => ({ name: real.property, localName: 'swept', groupSlug: real.group, ...label('Changed'), datatype: 'number' }),
  // A group with no property in it, which deleting would remove.
  '/settings/schema/groups': (action) => ({ slug: action === 'delete' ? real.emptyGroup : real.group, ...label('Changed') }),
  '/settings/schema/relationships': () => ({ slug: real.relationship, ...label('Changed'), propertyNames: real.property }),
  '/settings/schema/classes': () => ({ id: real.nodeClass, slug: 'guards-class', ...label('Changed'), parentId: real.pageClass }),
  '/settings/branding': (action) => ({
    id: /TypographyToken$/.test(action) ? real.token : real.paragraphStyle,
    tokenId: real.token,
    name: 'Changed',
    size: '30',
    ...label('Changed'),
    renderAs: 'p',
    colors: colors('#1d4ed8'),
    blockDefaults: JSON.stringify({ groups: { containers: { pad: 'lg' } } }),
    family: 'serif',
  }),
  '/settings/color-scheme': () => ({ scheme: 'dark', id: real.editorsPage }),
  '/settings/fonts': () => ({ familyId: real.family, variantId: real.variant, name: 'Swept Sans', weight: '700', style: 'italic' }),
  '/settings/footer': (action) => ({
    id: /LegalLink$/.test(action) ? real.legalLink : action === 'outdentColumnEntry' ? real.columnChild : real.column,
    kind: 'link',
    label: 'Changed',
    targetType: 'url',
    url: 'https://example.org/changed',
    direction: 'up',
    legalText: 'Changed',
    title: 'Changed',
    tagline: '',
    logoHeight: '40',
  }),
  '/settings/home': () => ({ id: real.editorsPage }),
  '/settings/languages': () => ({ defaultLocale: 'de', enabled: 'de' }),
  '/settings/navigation': (action) => ({ id: action === 'outdent' ? real.navChild : real.navEntry, kind: 'link', label: 'Changed', targetType: 'url', url: 'https://example.org/changed', direction: 'up' }),
  '/settings/page-layouts': () => ({ id: real.preset, ...label('Changed'), description: '', template: JSON.stringify(TWO), gap: '{}', sectionDefaults: '{}', enabled: 'false', direction: 'up' }),
  '/settings/styles': () => ({ id: real.sheet, name: 'Changed', enabled: 'false', direction: 'up' }),
  '/settings/styles/[id]': (action) => ({
    id: real.style,
    label: 'Changed',
    kind: 'inline',
    // The sheet's free CSS is rules; a named style's, declarations.
    css: action === 'saveFreeCss' ? '.grid { --pad-d: 40px; }' : 'color: #1d4ed8;',
    direction: 'up',
  }),
  '/settings/integrations/[plugin]': (_action, path) => integrationFields(path, 'sweep'),
};

const FILES: Record<string, () => Record<string, File>> = {
  '/settings/branding': () => ({ file: png() }),
  '/settings/fonts': () => ({ file: woff2() }),
};

/** A dynamic route's real segment values; a route missing here fails the sweep. */
const PARAMS: Record<string, () => string[]> = {
  '/settings/styles/[id]': () => [real.sheet],
  '/settings/integrations/[plugin]': () => PLUGINS_WITH_SETTINGS.map((plugin) => plugin.id),
};

function pathsOf(route: string): string[] {
  if (!route.includes('[')) return [route];
  const values = PARAMS[route];
  expect(values, `${route} has a real id to be swept with`).toBeTruthy();
  return values!().map((value) => route.replace(/\[[^\]]+\]/, value));
}

describe.skipIf(app.skipped)('the settings guards', () => {
  const served = app as ServedApp;

  async function admin(path: string, fields: Record<string, string>, files?: Record<string, File>) {
    const result = await formAction(served, path, fields, { as: 'admin', files });
    expect(result.type, `${path}: ${JSON.stringify(result.data)}`).toBe('success');
  }
  const idOf = async (query: Promise<{ id: string }[]>) => {
    const [row] = await query;
    expect(row, 'the row the admin made').toBeTruthy();
    return row.id;
  };

  beforeAll(async () => {
    service = await startRecorder();

    // The admin's page becomes the home page; the editor's takes the colour scheme's pin.
    real.page = (await createPage(served, 'admin')).id;
    real.editorsPage = (await createPage(served, 'editorA')).id;

    await admin('/settings/users?/create', { email: 'target@guards.test', name: 'Target', password: PASSWORD, role: 'editor' });
    real.user = await idOf(db`select id from users where email = 'target@guards.test'`);
    real.namespace = await createNamespace(served, { name: 'Guards space', slug: 'guards-space', accessLevel: 'restricted' });

    await admin('/settings/schema/groups?/save', { slug: real.group, ...label('Guards') });
    await admin('/settings/schema/groups?/save', { slug: real.emptyGroup, ...label('Guards, empty') });
    await admin('/settings/schema/properties?/save', { localName: 'swept', groupSlug: real.group, ...label('Swept'), datatype: 'text' });
    await admin('/settings/schema/relationships?/save', { slug: real.relationship, ...label('Guards relationship') });
    real.pageClass = await idOf(db`select id from node_classes where slug = 'page' and kind = 'type'`);
    await admin('/settings/schema/classes?/save', { slug: 'guards-class', ...label('Guards class'), parentId: real.pageClass });
    real.nodeClass = await idOf(db`select id from node_classes where slug = 'guards-class'`);

    await admin('/settings/branding?/upload', {}, { file: png() });
    await admin('/settings/branding?/uploadDark', {}, { file: png() });
    await admin('/settings/branding?/saveColors', { colors: colors('#0a7d3b') });
    await admin('/settings/branding?/saveBlockDefaults', { blockDefaults: JSON.stringify({ groups: { containers: { pad: 'md' } } }) });
    await admin('/settings/branding?/createTypographyToken', { name: 'Guards token', size: '44' });
    real.token = await idOf(db`select id from typography_tokens where name = 'Guards token'`);
    await admin('/settings/branding?/createParagraphStyle', { ...label('Guards style'), renderAs: 'p', tokenId: '' });
    real.paragraphStyle = await idOf(db`select id from paragraph_styles where label ->> 'en' = 'Guards style'`);

    await admin('/settings/fonts?/createFamily', { name: 'Guards Sans' });
    real.family = await idOf(db`select id from font_families where name = 'Guards Sans'`);
    await admin('/settings/fonts?/addVariant', { familyId: real.family, weight: '400', style: 'normal' }, { file: woff2() });
    real.variant = await idOf(db`select id from font_variants where family_id = ${real.family}`);

    await admin('/settings/styles?/createSheet', { name: 'Guards A' });
    await admin('/settings/styles?/createSheet', { name: 'Guards B' });
    real.sheet = await idOf(db`select id from stylesheets where name = 'Guards B'`);
    await admin(`/settings/styles/${real.sheet}?/createStyle`, { label: 'Guards one', kind: 'inline', css: 'color: #b45309;' });
    await admin(`/settings/styles/${real.sheet}?/createStyle`, { label: 'Guards two', kind: 'inline', css: 'color: #b45309;' });
    real.style = await idOf(db`select id from custom_styles where label = 'Guards two'`);

    for (const name of ['Guards one', 'Guards two']) {
      await admin('/settings/page-layouts?/createPreset', { ...label(name), description: '', template: JSON.stringify(TWO), gap: '{}', sectionDefaults: '{}' });
    }
    real.preset = await idOf(db`select id from page_layout_presets where scope_kind = 'site' and label ->> 'en' = 'Guards two'`);

    // A group holding a child, then a top-level link: the link would move up or nest, the child would lift out.
    await admin('/settings/navigation?/create', { kind: 'group', label: 'Guards group' });
    const navGroup = await idOf(db`select id from nav_tree_entries where consumer = 'nav' and label = 'Guards group'`);
    await admin('/settings/navigation?/create', { kind: 'link', label: 'Guards child', targetType: 'url', url: 'https://example.org/child', parentId: navGroup });
    real.navChild = await idOf(db`select id from nav_tree_entries where consumer = 'nav' and label = 'Guards child'`);
    await admin('/settings/navigation?/create', { kind: 'link', label: 'Guards link', targetType: 'url', url: 'https://example.org/guards' });
    real.navEntry = await idOf(db`select id from nav_tree_entries where consumer = 'nav' and label = 'Guards link'`);

    await admin('/settings/footer?/createColumnEntry', { kind: 'group', label: 'Guards column' });
    const column = await idOf(db`select id from nav_tree_entries where consumer = 'footer' and label = 'Guards column'`);
    await admin('/settings/footer?/createColumnEntry', { kind: 'link', label: 'Guards column child', targetType: 'url', url: 'https://example.org/child', parentId: column });
    real.columnChild = await idOf(db`select id from nav_tree_entries where consumer = 'footer' and label = 'Guards column child'`);
    await admin('/settings/footer?/createColumnEntry', { kind: 'link', label: 'Guards column link', targetType: 'url', url: 'https://example.org/column' });
    real.column = await idOf(db`select id from nav_tree_entries where consumer = 'footer' and label = 'Guards column link'`);
    for (const name of ['Guards imprint', 'Guards privacy']) await admin('/settings/footer?/createLegalLink', { label: name, targetType: 'url', url: 'https://example.org/legal' });
    real.legalLink = await idOf(db`select id from footer_links where label = 'Guards privacy'`);
    await admin('/settings/footer?/saveLegalText', { legalText: 'Guards legal text' });
    await admin('/settings/footer?/saveBranding', { title: 'Guards', tagline: '', logoHeight: '32' });

    await admin('/settings/home?/setHome', { id: real.page });

    // Every integration pointed at the recorder; for one people connect to, an
    // editor's connection, which disconnecting everyone would end. It is sealed
    // with the run's key, which the served build opens it with.
    const editor = await userOf('editorA');
    for (const plugin of PLUGINS_WITH_SETTINGS) {
      const path = `/settings/integrations/${plugin.id}`;
      await admin(`${path}?/save`, integrationFields(path, 'setup'));
      if (!plugin.connections) continue;
      const origin = await pluginOrigin(plugin);
      expect(origin, `${plugin.id} is pointed at the recorder`).toBe(service.origin);
      const binding = { userId: editor.id, plugin: plugin.id, origin: origin! };
      const kind = plugin.connections.kinds[0];
      const sealed = sealCredential(binding, { kind, login: 'guards', secret: 'guards-secret' });
      expect(sealed, 'the run has a key to seal with').toBeTruthy();
      await storeConnection(db, { ...binding, kind, sealed: sealed!, accountId: 'guards', accountLabel: 'Guards' });
    }
  });
  afterAll(async () => {
    await service?.close();
  });

  describe('what the sweep covers', () => {
    it('every settings route belongs to a section of the tree, and every section inside the settings has a route', async () => {
      // The route files were found — the overview's among them — and every route with form actions is a page.
      expect(PAGE_ROUTES).toContain('/settings');
      expect(ACTIONS.size).toBeGreaterThan(0);
      for (const route of ACTIONS.keys()) expect(PAGE_ROUTES).toContain(route);
      const paths = PAGE_ROUTES.flatMap(pathsOf);
      for (const path of paths) if (path !== '/settings') expect(itemOf(path), `${path} belongs to a section of the settings tree`).toBeTruthy();
      for (const item of TREE_ITEMS) if (!leavesSettings(item.href)) expect(paths, `${item.id} has a route`).toContain(item.href);
    });

    it('every gated section has a role the sweep acts as that lacks its action', async () => {
      for (const item of TREE_ITEMS) if (item.action) expect(lacking(item.action), item.id).not.toEqual([]);
    });
  });

  // Left out: the overview, the personal sections and the About leaf, a public
  // page outside the settings (about.http.test.ts).
  describe('GET of a gated section', () => {
    for (const route of PAGE_ROUTES.filter((r) => r !== '/settings' && !personal(r))) {
      it(`GET ${route}`, async () => {
        for (const path of pathsOf(route)) {
          // The control: the path is real, an admin opens it.
          expect((await call(served, path, { as: 'admin' })).status, `admin: GET ${path}`).toBe(200);
          for (const role of lacking(gateOf(path))) expect((await call(served, path, { as: role })).status, `${role}: GET ${path}`).toBe(403);
        }
      });
    }
  });

  describe('a form action of a gated section', () => {
    // Each table's row count and digest. Sessions (the sweep's own sign-ins),
    // rate limits and logs are not what a guard keeps.
    const UNTRACKED = /^sessions$|rate.?limit|(^|_)logs?($|_)/;
    async function snapshot(): Promise<Record<string, string>> {
      const tables = await db<{ name: string }[]>`
        select table_name as name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
      const out: Record<string, string> = {};
      for (const { name } of tables) {
        if (UNTRACKED.test(name)) continue;
        const [row] = await db.unsafe<{ digest: string }[]>(`select count(*) || ':' || md5(coalesce(string_agg(t::text, ',' order by t::text), '')) as digest from "${name}" t`);
        out[name] = row.digest;
      }
      return out;
    }

    let before: Record<string, string> = {};
    beforeAll(async () => {
      before = await snapshot();
      // What the setup asked of it is not the sweep's.
      service.requests.splice(0);
    });

    for (const [route, actions] of ACTIONS) {
      if (personal(route)) continue;
      for (const action of actions) {
        it(`${route}?/${action}`, async () => {
          for (const path of pathsOf(route)) {
            for (const role of lacking(gateOf(path))) {
              const result = await formAction(served, `${path}?/${action}`, FIELDS[route]?.(action, path) ?? {}, { as: role, files: FILES[route]?.() });
              expect({ status: result.status, type: result.type }, `${role}: ${path}?/${action}`).toEqual({ status: 403, type: 'error' });
            }
          }
        });
      }
    }

    it('stored and removed nothing, and probed nothing', async () => {
      expect(await snapshot()).toEqual(before);
      expect(service.requests).toEqual([]);
    });

    // The control: an admin's same calls do change a table and ask the service.
    it('sees what the same calls do for an admin: a stored change, a probe, a removal', async () => {
      const changedSince = async (previous: Record<string, string>) => {
        const now = await snapshot();
        return { now, changed: Object.keys(now).filter((table) => now[table] !== previous[table]) };
      };
      const renamed = await formAction(served, '/settings/styles?/renameSheet', FIELDS['/settings/styles']('renameSheet', '/settings/styles'), { as: 'admin' });
      expect(renamed.type).toBe('success');
      let { now, changed } = await changedSince(before);
      expect(changed).toEqual(['stylesheets']);

      for (const plugin of PLUGINS_WITH_SETTINGS) {
        const path = `/settings/integrations/${plugin.id}`;
        const asked = service.requests.length;
        const checked = await formAction(served, `${path}?/check`, FIELDS['/settings/integrations/[plugin]']('check', path), { as: 'admin' });
        expect(checked.type, JSON.stringify(checked.data)).toBe('success');
        expect(service.requests.length, `${plugin.id}: the check asked the service`).toBeGreaterThan(asked);
        if (!plugin.connections) continue;
        const cleared = await formAction(served, `${path}?/disconnectAll`, {}, { as: 'admin' });
        expect(cleared.data).toMatchObject({ cleared: 1 });
        ({ now, changed } = await changedSince(now));
        expect(changed).toEqual(['user_connections']);
      }
    });
  });
});
