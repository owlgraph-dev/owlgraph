// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Recomputes the search text of every page, document and collection, for when
// the extraction changes. Safe to re-run: search_tsv is generated from it.
//
//   npm run db:backfill-search
//   npm run db:backfill-search -- --suggest-locales
//
// --suggest-locales also suggests each upload's detected language (docs/architecture/languages.md);
// not the default, since a re-run would bring back dismissed suggestions.
import { db } from '../src/lib/platform/db.server';
import { extractSearchText } from '../src/lib/features/search/server';
import { getDocumentText } from '../src/lib/features/documents/server';
import { detectLocale } from '../src/lib/features/documents';
import { loadSiteLocaleConfig } from '../src/lib/platform/i18n/siteLocales.server';
// Not the barrel: it reaches Svelte components, which plain Node can't load.
import { reindexSourceSearch } from '../src/lib/features/pluginHost/sourceSearch.server';

const suggestLocales = process.argv.includes('--suggest-locales');
const { enabled } = await loadSiteLocaleConfig();

// A generated column can't read nodes, so search_title and search_locale
// mirror nodes.title and nodes.locale; a drift never survives a backfill.
await db`update pages p set search_title = n.title from nodes n where n.id = p.id`;
await db`update documents d set search_title = n.title from nodes n where n.id = d.id`;
await db`update collections c set search_title = n.title from nodes n where n.id = c.id`;
await db`update pages p set search_locale = n.locale from nodes n where n.id = p.id and p.search_locale is distinct from n.locale`;
await db`update documents d set search_locale = n.locale from nodes n where n.id = d.id and d.search_locale is distinct from n.locale`;
await db`update collections c set search_locale = n.locale from nodes n where n.id = c.id and c.search_locale is distinct from n.locale`;

const pages = await db<{ id: string; doc: unknown }[]>`select id, doc from pages`;
let pn = 0;
for (const p of pages) {
  const { headings, body } = extractSearchText(p.doc);
  await db`update pages set search_headings = ${headings}, search_body = ${body} where id = ${p.id}`;
  pn++;
}

// What each node's integration says of it, then search_meta, by the same
// expressions refreshDocumentSearchMeta and refreshCollectionSearchMeta run.
const sources = await reindexSourceSearch();
await db`
  update documents d set search_meta = trim(concat_ws(' ',
    (select string_agg(p.value, ' ' order by p.name, p.value) from node_properties p where p.node_id = d.id),
    (select string_agg(t.tag, ' ' order by t.tag) from node_tags t where t.node_id = d.id),
    d.source_search
  ))`;
await db`
  update collections c set search_meta = trim(concat_ws(' ',
    (select string_agg(p.value, ' ' order by p.name, p.value) from node_properties p where p.node_id = c.id),
    (select string_agg(t.tag, ' ' order by t.tag) from node_tags t where t.node_id = c.id),
    c.source_search
  ))`;

// A link document has no stored file.
const docs = await db<{ id: string; locale: string }[]>`
  select d.id, n.locale from documents d join nodes n on n.id = d.id where d.source = 'upload'`;
let dn = 0;
let dfail = 0;
let suggested = 0;
for (const d of docs) {
  try {
    const res = await getDocumentText(d.id);
    await db`update documents set search_text = ${res?.text ?? ''} where id = ${d.id}`;
    if (suggestLocales) {
      const detected = detectLocale(res?.text ?? '', enabled);
      if (detected && detected !== d.locale) {
        await db`update documents set detected_locale = ${detected} where id = ${d.id}`;
        suggested++;
      }
    }
  } catch {
    // A corrupt file doesn't abort the backfill: its title is indexed alone.
    await db`update documents set search_text = '' where id = ${d.id}`;
    dfail++;
  }
  dn++;
}

console.log(
  `Backfilled search text for ${pn} page(s) and ${dn} document(s)` +
    (dfail ? ` (${dfail} document(s) had no extractable text)` : '') +
    (suggestLocales ? `; suggested a content language for ${suggested} document(s)` : '') +
    `; indexed what their sources say of ${sources.documents} document(s) and ${sources.collections} collection(s) from integrations.`
);
await db.end();
process.exit(0);
