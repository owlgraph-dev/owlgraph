// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A /search card's lead text and document kind. No visibility check here: pass
// only ids the list query already read under the viewer's permissions.
import { db } from '$lib/platform/db.server';
import { extractSearchText } from './pageText.server';
import { LEAD_LENGTH, clipText, documentKindOf, type DocumentKind } from './searchCards';

export interface SearchCardExtras {
  /** The start of the content as a reader sees it; '' when there is none. */
  lead: string;
  documentKind: DocumentKind | null;
}

export async function searchCardExtras(ids: string[]): Promise<Map<string, SearchCardExtras>> {
  if (!ids.length) return new Map();
  const rows = await db<{ id: string; doc: unknown; source: string | null; mime: string | null; doc_text: string | null; is_document: boolean; is_page: boolean }[]>`
    select n.id, p.doc, d.source, d.mime, left(d.search_text, ${LEAD_LENGTH * 3}) as doc_text, d.id is not null as is_document, p.id is not null as is_page
    from nodes n left join pages p on p.id = n.id left join documents d on d.id = n.id
    where n.id = any(${ids}::uuid[])`;
  // A collection has no text of its own to lead with.
  return new Map(
    rows.map((r) => [
      r.id,
      r.is_document
        ? { lead: clipText(r.doc_text ?? ''), documentKind: documentKindOf(r.source, r.mime) }
        : r.is_page
          ? { lead: clipText(extractSearchText(r.doc, { propertyNames: false }).body), documentKind: null }
          : { lead: '', documentKind: null },
    ])
  );
}
