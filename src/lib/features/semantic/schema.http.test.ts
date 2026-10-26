// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import type { Role } from '$tests/integration/users';

// Classes and labels are set up through the settings form actions, as an admin does.

const app = await startApp();

const DE = { 'accept-language': 'de-DE,de;q=0.9' };
const EN = { 'accept-language': 'en-US,en;q=0.9' };

afterAll(async () => {
  if (!app.skipped) await app.close();
});

let n = 0;
const unique = (base: string) => `${base}-${(++n).toString(36)}${Date.now().toString(36)}`;
const typeId = async (slug: 'page' | 'document') => (await db<{ id: string }[]>`select id from node_classes where slug = ${slug}`)[0].id;
const dom = async (res: Response) => {
  expect(res.status, res.url).toBe(200);
  return new JSDOM(await res.text()).window.document;
};
/** The value of the field a `<label>` names by its own text, the control inside it. */
const fieldValue = (document: Document, label: string) => {
  const found = [...document.querySelectorAll('label')].find((l) => l.firstChild?.textContent?.trim() === label);
  return found?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.value;
};

describe.skipIf(app.skipped)('a node’s class, through the page API', () => {
  const served = app as ServedApp;
  const patch = (id: string, nodeClassId: string | null) => call(served, `/api/pages/${id}`, { as: 'admin', method: 'PATCH', json: { nodeClassId } });

  it('an unknown class id answers 400', async () => {
    const { id } = await createPage(served, 'admin', { visibility: 'restricted' });
    expect((await patch(id, '00000000-0000-0000-0000-000000000000')).status).toBe(400);
  });

  it('a document class answers 400 class_type_mismatch, and null resets the page to the page type', async () => {
    const slug = unique('http-docclass');
    const saved = await formAction(served, '/settings/schema/classes?/save', { slug, 'label.en': 'HTTP document class', parentId: await typeId('document'), propertyGroup: '' }, { as: 'admin' });
    expect(saved.type, JSON.stringify(saved.data)).toBe('success');
    const [docClass] = await db<{ id: string }[]>`select id from node_classes where slug = ${slug}`;
    const { id } = await createPage(served, 'admin', { visibility: 'restricted' });

    const mismatch = await patch(id, docClass.id);
    expect(mismatch.status).toBe(400);
    expect(((await mismatch.json()) as { error: { code: string } }).error.code).toBe('class_type_mismatch');

    const reset = await patch(id, null);
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as { nodeClassId: string }).nodeClassId).toBe(await typeId('page'));
  });
});

describe.skipIf(app.skipped)('the class catalog', () => {
  const served = app as ServedApp;

  it('an editor’s GET of /settings/schema/classes answers 403', async () => {
    expect((await call(served, '/settings/schema/classes', { as: 'editorA' })).status).toBe(403);
  });
});

describe.skipIf(app.skipped)('a document’s fields', () => {
  const served = app as ServedApp;

  /** A document of the test's own, uploaded as `as` (it inherits the public default namespace), its properties set. */
  async function document(as: Role, properties: { name: string; value: string }[]) {
    const form = new FormData();
    form.append('title', `HTTP Labels Doc ${++n}`);
    form.append('file', new File([`http: labels ${n}`], `labels-${n}.txt`, { type: 'text/plain' }));
    const created = await call(served, '/api/documents', { as, body: form });
    expect(created.ok, await created.clone().text()).toBe(true);
    const doc = (await created.json()) as { id: string; slug: string };
    const set = await call(served, `/api/documents/${doc.id}`, { as, method: 'PATCH', json: { properties } });
    expect(set.ok, await set.clone().text()).toBe(true);
    return doc;
  }

  const cases = [
    { locale: 'de-DE', headers: DE, abstract: 'Zusammenfassung', description: 'Beschreibung' },
    { locale: 'en-US', headers: EN, abstract: 'Abstract', description: 'Description' },
  ];
  for (const c of cases) {
    it(`requested in ${c.locale}, are named "${c.abstract}" and "${c.description}" on the read view and in the editor`, async () => {
      const doc = await document('editorA', [
        { name: 'documents:abstract', value: 'A short summary' },
        { name: 'documents:description', value: 'What the document is' },
      ]);

      const view = await dom(await call(served, `/${doc.slug}`, { as: 'editorA', headers: c.headers }));
      const headings = [...view.querySelectorAll('h2')].map((h) => h.textContent?.trim());
      expect(headings).toContain(c.abstract);
      expect(headings).toContain(c.description);

      const editor = await dom(await call(served, `/${doc.slug}/edit`, { as: 'editorA', headers: c.headers }));
      expect(fieldValue(editor, c.abstract)).toBe('A short summary');
      expect(fieldValue(editor, c.description)).toBe('What the document is');
    });
  }

  it('carry the documents group through the document node type: its class is Document, and its Author value is kept and shown', async () => {
    const doc = await document('admin', [{ name: 'documents:author', value: 'Ada Lovelace' }]);
    const [{ slug }] = await db<{ slug: string }[]>`select c.slug from nodes n join node_classes c on c.id = n.class_id where n.id = ${doc.id}`;
    expect(slug).toBe('document');

    const editor = await dom(await call(served, `/${doc.slug}/edit`, { as: 'admin', headers: EN }));
    expect(fieldValue(editor, 'Author')).toBe('Ada Lovelace');
    expect(fieldValue(editor, 'Abstract')).toBe('');

    const view = await dom(await call(served, `/${doc.slug}`, { as: 'admin', headers: EN }));
    expect(view.querySelector('.class-badge')?.textContent?.trim()).toBe('Document');
    const author = [...view.querySelectorAll('dt')].find((dt) => dt.textContent?.trim() === 'Author');
    expect(author?.nextElementSibling?.textContent?.trim()).toBe('Ada Lovelace');
  });
});

describe.skipIf(app.skipped)('a schema label', () => {
  const served = app as ServedApp;
  const save = (path: string, fields: Record<string, string>) => formAction(served, path, fields, { as: 'admin' });

  it('without a German translation reads in English — in the German settings table, marked missing, and over GraphQL, which lists only what is stored', async () => {
    const group = unique('httplabels');
    expect((await save('/settings/schema/groups?/save', { slug: group, 'label.en': `${group} English` })).type).toBe('success');
    const localName = unique('note');
    const definition = `${group}:${localName}`;
    const saved = await save('/settings/schema/properties?/save', { localName, groupSlug: group, 'label.en': 'HTTP English note', datatype: 'text' });
    expect(saved.type, JSON.stringify(saved.data)).toBe('success');

    const table = await dom(await call(served, '/settings/schema/properties', { as: 'admin', headers: DE }));
    const row = [...table.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(definition));
    expect(row?.textContent).toContain('HTTP English note');
    expect(row?.textContent).toContain('Deutsch fehlt');

    const res = await call(served, '/api/graphql', {
      as: 'admin',
      headers: DE,
      json: { query: '{ propertyDefinitions { name de: label(locale: DE) en: label(locale: EN) labels { locale text } } }' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { errors?: unknown; data: { propertyDefinitions: { name: string }[] } };
    expect(body.errors).toBeFalsy();
    const named = (name: string) => body.data.propertyDefinitions.find((d) => d.name === name);
    expect(named(definition)).toEqual({ name: definition, de: 'HTTP English note', en: 'HTTP English note', labels: [{ locale: 'EN', text: 'HTTP English note' }] });
    // A seeded field carries both languages.
    expect(named('documents:abstract')).toMatchObject({ de: 'Zusammenfassung', en: 'Abstract' });
  });

  it('is refused by the group save without its English text, and no group is stored', async () => {
    const namespace = unique('httpnolabel');
    const refused = await save('/settings/schema/groups?/save', { slug: namespace, 'label.de': 'Nur Deutsch' });
    expect(refused.type).toBe('failure');
    expect(refused.status).toBe(400);
    expect(refused.data).toEqual({ error: { code: 'default_text_required', message: 'Enter the label in the default language (en).', field: 'label', locale: 'en' } });
    expect(await db`select 1 from property_groups where slug = ${namespace}`).toHaveLength(0);
  });

  it('says why in the interface language: the same refusal in German', async () => {
    const namespace = unique('httpnolabelde');
    const refused = await formAction(served, '/settings/schema/groups?/save', { slug: namespace, 'label.de': 'Nur Deutsch' }, { as: 'admin', headers: DE });
    expect([refused.type, refused.status]).toEqual(['failure', 400]);
    expect(refused.data).toEqual({
      error: { code: 'default_text_required', message: 'Gib die Bezeichnung in der Standardsprache (en) ein.', field: 'label', locale: 'en' },
    });
  });
});
