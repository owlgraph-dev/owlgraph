// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { sourceHref, sourceInfo } from '$lib/platform/source.server';
import { call, startApp, type ServedApp } from '$tests/integration/http';
import type { Role } from '$tests/integration/users';

// AGPL-3.0 §13 (docs/guides/deployment.md, "Source code for network users"). The footer's
// info icon is the browser's (e2e/about.spec.ts).

const app = await startApp();

const ABOUT = 'About this software';

afterAll(async () => {
  if (!app.skipped) await app.close();
});

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';
const version = () => JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version as string;
const serverVersion = async () => (await db<{ server_version: string }[]>`show server_version`)[0].server_version;
const latestMigration = () => readdirSync(join(process.cwd(), 'migrations')).filter((f) => f.endsWith('.sql')).sort().at(-1)!.replace(/\.sql$/, '');
const pluginIds = () => readdirSync(join(process.cwd(), 'src', 'lib', 'plugins'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

/** Anonymous without a role. */
async function about(served: ServedApp, role?: Role) {
  const res = await call(served, '/-/about', { as: role });
  expect(res.status, `${role ?? 'visitor'}: GET /-/about`).toBe(200);
  const html = await res.text();
  return { res, html, document: new JSDOM(html).window.document };
}

/** A settings row by its label (a labelled group). */
function row(document: Document, label: string): Element {
  const found = [...document.querySelectorAll('[role="group"]')].find((g) => text(document.getElementById(g.getAttribute('aria-labelledby') ?? '')) === label);
  expect(found, `the row ${label}`).toBeTruthy();
  return found!;
}

function section(document: Document, heading: string): Element {
  const found = [...document.querySelectorAll('section')].find((s) => [...s.querySelectorAll('h2')].some((h) => text(h) === heading));
  expect(found, `the section ${heading}`).toBeTruthy();
  return found!;
}

describe.skipIf(app.skipped)('the About page, signed out', () => {
  const served = app as ServedApp;

  it('names the version, offers this version’s source, the licence and the dependencies’ licences, and stays out of search engines', async () => {
    const { res, document } = await about(served);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect([...document.querySelectorAll('h1')].map(text)).toContain(ABOUT);
    const page = document.querySelector('article.about')!;
    expect(text(page)).toContain(`This site runs owlgraph ${version()},`);
    expect(text(page.querySelector('.notice'))).toMatch(/^owlgraph is free software: .* no warranty/);
    const link = (name: string) => [...page.querySelectorAll('a')].find((a) => text(a) === name)?.getAttribute('href');
    expect(link('Source code of this version')).toBe(sourceHref(sourceInfo()));
    expect(link('Licence')).toBe('/-/license');
    expect(link('Third-party licences')).toBe('/licenses.txt');

    const license = await call(served, '/-/license');
    expect(license.status).toBe(200);
    expect(license.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    const licenseText = await license.text();
    expect(licenseText).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    expect(licenseText).toContain('owlgraph Plugin Exception');

    const thirdParty = await call(served, '/licenses.txt');
    expect(thirdParty.status).toBe(200);
    expect(thirdParty.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await thirdParty.text()).toContain('owlgraph — third-party licences');

    // Every page's head links the licence and names the software, by name only.
    const home = await (await call(served, '/')).text();
    expect(home).toContain('<link rel="license" href="/-/license"');
    expect(home).toMatch(/<meta name="generator" content="owlgraph"\s*\/?>/);
  });
});

describe.skipIf(app.skipped)('the installation section', () => {
  const served = app as ServedApp;

  describe('an admin', () => {
    it('sees how the installation runs: versions and address, its integrations, and what could be wrong', async () => {
      const { document } = await about(served, 'admin');
      const source = sourceInfo();

      expect([...document.querySelectorAll('h2')].map(text)).toContain('Installation');
      expect(text(row(document, 'Version'))).toContain(version());
      expect(text(row(document, 'Revision'))).toContain(source.revision === 'dev' ? 'Development build' : source.revision);
      expect(text(row(document, 'Address'))).toContain(served.origin);
      expect(text(row(document, 'Runtime'))).toContain(`Node.js ${process.version}`);
      expect(text(row(document, 'Database'))).toContain(`PostgreSQL ${await serverVersion()}`);
      expect(text(row(document, 'Languages'))).toContain('English');

      // One row per integration the build carries, on or off.
      const integrations = [...section(document, 'Integrations').querySelectorAll('[role="group"]')];
      expect(integrations).toHaveLength(pluginIds().length);
      for (const r of integrations) expect(text(r)).toMatch(/^.+(On|Off)/);

      // The test database is migrated to the end, and the server has a fit key.
      expect([...document.querySelectorAll('h2')].map(text)).toContain('Diagnostics');
      expect(text(row(document, 'Database schema'))).toContain(`the latest ${latestMigration()}.sql`);
      expect(text(row(document, 'Database schema'))).toContain('Nothing waiting to be applied');
      expect(text(row(document, 'Secret key'))).toContain('Set');
      expect(text(row(document, 'Secret key'))).not.toContain('unusable');
    });
  });

  // The whole response is searched, hydration data included. The admin's is the
  // control: every marker is there, so its absence elsewhere means something.
  it('reaches an admin’s page and no one else’s: not a visitor’s, an editor’s or a viewer’s', async () => {
    // What only the installation section shows; a plugin's id travels in the page's data.
    const markers = [new URL(served.origin).host, process.version, `PostgreSQL ${await serverVersion()}`, latestMigration(), ...pluginIds()];
    // The build's asset paths are file names, not details of the installation.
    const html = async (role?: Role) => (await about(served, role)).html.replace(/\/_app\/[^"'\s)]+/g, '').toLowerCase();

    const admin = await html('admin');
    for (const marker of markers) expect(admin, `admin: ${marker}`).toContain(marker.toLowerCase());
    for (const [who, role] of [['visitor', undefined], ['editor', 'editorA'], ['viewer', 'viewer']] as const) {
      const page = await html(role);
      for (const marker of markers) expect(page, `${who}: ${marker}`).not.toContain(marker.toLowerCase());
    }
  });
});
