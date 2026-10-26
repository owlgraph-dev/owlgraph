// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site-wide adaptive readiness report (docs/architecture/theming.md, "Letting pages
// adapt"). Viewer-scoped: only pages they can read are listed, only pages they
// can write are pinned.
import { db } from '$lib/platform/db.server';
import { checkAdaptiveReadiness, type ContentScheme, type JsonDoc } from '$lib/features/content';
import type { SessionUser } from '$lib/features/auth/server';
import { readableNodes, namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { getPage, setPageContentScheme, userCanWritePage } from './pages.server';

export interface PageReadiness {
  id: string;
  slug: string;
  namespace_slug: string | null;
  title: string;
  /** One per block, colour and scheme; an image with an unknown ground counts as text. */
  text: number;
  border: number;
  html: number;
}

export interface SiteReadiness {
  inheriting: number;
  /** Pages with a scheme of their own, which a change of default doesn't reach. */
  pinned: number;
  /** The inheriting pages with findings, most first. */
  pages: PageReadiness[];
  /** Up to three inheriting pages to preview dark: most findings first, else the first. */
  sample: Pick<PageReadiness, 'id' | 'slug' | 'namespace_slug' | 'title'>[];
}

export async function siteReadiness(user: SessionUser): Promise<SiteReadiness> {
  const rows = await db<{ id: string; slug: string; namespace_slug: string | null; title: string; doc: JsonDoc; content_scheme: ContentScheme | null }[]>`
    select p.id, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, p.doc, p.content_scheme
    from pages p join nodes n on n.id = p.id ${db.unsafe(namespaceJoin('n'))}
    where ${readableNodes(user, 'n')}
    order by n.title`;
  const pages: PageReadiness[] = [];
  const clean: SiteReadiness['sample'] = [];
  let inheriting = 0;
  for (const row of rows) {
    if (row.content_scheme) continue;
    inheriting++;
    const findings = checkAdaptiveReadiness(row.doc);
    if (!findings.length) {
      if (clean.length < 3) clean.push({ id: row.id, slug: row.slug, namespace_slug: row.namespace_slug, title: row.title });
      continue;
    }
    const count = (kind: string) => findings.filter((f) => f.kind === kind).length;
    pages.push({ id: row.id, slug: row.slug, namespace_slug: row.namespace_slug, title: row.title, text: count('text') + count('image-ground'), border: count('border'), html: count('html') });
  }
  const total = (p: PageReadiness) => p.text + p.border + p.html;
  pages.sort((a, b) => total(b) - total(a));
  const sample = [...pages, ...clean].slice(0, 3).map(({ id, slug, namespace_slug, title }) => ({ id, slug, namespace_slug, title }));
  return { inheriting, pinned: rows.length - inheriting, pages, sample };
}

/** Pins inheriting pages the viewer can edit to light; returns how many. */
export async function keepPagesLight(user: SessionUser, ids: readonly string[]): Promise<number> {
  let pinned = 0;
  for (const id of new Set(ids)) {
    const page = await getPage(id);
    if (!page || page.content_scheme || !(await userCanWritePage(user, page))) continue;
    await setPageContentScheme(id, 'light');
    pinned++;
  }
  return pinned;
}
