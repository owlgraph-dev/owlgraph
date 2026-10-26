// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { graphql } from 'graphql';
import { setNodeLocale } from '$lib/features/nodes/server';
import { createPage, saveDoc } from '$lib/features/pages/server';
import { schema } from '$lib/features/query/server';
import { userOf } from '$tests/integration/users';

async function graph<T>(source: string, variableValues: Record<string, unknown>): Promise<T> {
  const res = await graphql({ schema, source, variableValues, contextValue: { user: await userOf('editorA') } });
  expect(res.errors).toBeUndefined();
  return res.data as T;
}
const searchIds = async (q: string) =>
  (await graph<{ search: { id: string }[] }>('query($q: String!) { search(text: $q, first: 50) { id } }', { q })).search.map((h) => h.id);

async function pageIn(locale: 'en' | 'de', title: string, body?: string) {
  const page = await createPage(title, await userOf('editorA'), { locale, visibility: 'internal' });
  if (body) await saveDoc(page.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] });
  return page;
}

describe('the content language', () => {
  it('indexes each page in its own language — runs finds running on the English page only, Haus finds Häusern on the German one — one query finds both, and a changed language re-indexes', async () => {
    const english = await pageIn('en', 'English content', 'The runners kept running through the night');
    const german = await pageIn('de', 'Deutscher Inhalt', 'In den Häusern brennt noch Licht, running');

    // English inflection: on the English page only — the German page indexes
    // "running" as a German word, which "runs" does not stem to.
    const runs = await searchIds('runs');
    expect(runs).toContain(english.id);
    expect(runs).not.toContain(german.id);
    // German inflection, from the same query.
    expect(await searchIds('Haus')).toContain(german.id);

    // As English, the formerly German page's "running" stems.
    await setNodeLocale(german.id, 'en');
    expect(await searchIds('runs')).toContain(german.id);
  });

  it('a LOCALE intrinsic condition answers only the nodes in that content language, each carrying its locale', async () => {
    const english = await pageIn('en', 'Locale filter en');
    const german = await pageIn('de', 'Locale filter de');
    const { nodes } = await graph<{ nodes: { id: string; locale: string }[] }>(
      'query($f: NodeFilter!) { nodes(filter: $f, first: 50) { id locale } }',
      { f: { intrinsic: { field: 'LOCALE', operator: 'EQ', value: 'en' } } }
    );
    expect(nodes.find((n) => n.id === english.id)?.locale).toBe('EN');
    expect(nodes.some((n) => n.id === german.id)).toBe(false);
    expect(nodes.every((n) => n.locale === 'EN')).toBe(true);
  });
});
