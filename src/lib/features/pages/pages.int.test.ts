// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { db, type JsonArg } from '$lib/platform/db.server';
import { unknownKeys, type JsonNode } from '$lib/features/content';
import { createImageAsset } from '$lib/features/media/server';
import { connectAs, textOf, userOf } from '$tests/integration/mcp';
import {
  acquireLock,
  applyPicksToPage,
  captureStandaloneVersion,
  createPage,
  deletePage,
  getPageContentScheme,
  getVersion,
  keepPagesLight,
  listVersions,
  restoreVersion,
  saveDoc,
  siteReadiness,
} from './server';
import { isUnknownDropped } from './unknownGuard';
import { retiredWidget, textPara, txt } from '$tests/e2e/doc';
import { storedDoc } from '$tests/support/storedDoc';

// The agent is the real MCP server in-process (tests/integration/mcp.ts).

const seed = inject('seed');

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: unknown[] };

const doc = (...content: Node[]) => ({ type: 'doc', content });
const pageLink = (target: { id: string; slug: string }) => ({ type: 'pageLink', attrs: { targetPageId: target.id, targetSlug: target.slug } });

const holds = (value: unknown, text: string) => JSON.stringify(value).includes(text);

let n = 0;
async function adminPage(title: string, content?: unknown) {
  const page = await createPage(`${title} ${++n}`, await userOf('admin'));
  if (content) await saveDoc(page.id, content);
  return page;
}

// docs/architecture/blocks/anatomy.md, "Unknown blocks". The kind is invented: a plugin merely
// turned off keeps its kinds known.
describe('the unknown-block guard', () => {
  /** An unknown block at the top level and one in the first cell of a grid. */
  const guardedPage = () =>
    adminPage(
      'Guarded',
      doc(textPara('p-first', 'First paragraph'), retiredWidget('w-top'), {
        type: 'grid',
        attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
        content: [
          { type: 'gridCell', content: [textPara('p-left', 'Left column'), retiredWidget('w-cell')] },
          { type: 'gridCell', content: [textPara('p-right', 'Right column')] },
        ],
      })
    );

  it('refuses an agent’s block edit that would lose one, naming it, and takes it once the agent names it', async () => {
    const { id } = await guardedPage();
    const agent = await connectAs('admin');
    const call = (name: string, args: Record<string, unknown>) => agent.callTool({ name, arguments: { pageId: id, ...args } });

    const gridGone = await call('delete_block', { blockId: 'grid-1' });
    expect(gridGone.isError).toBe(true);
    expect(textOf(gridGone)).toContain('w-cell (retiredWidget)');
    expect(textOf(gridGone)).toContain('acknowledgeDropped');
    expect(holds(await storedDoc(id), '"grid-1"')).toBe(true);

    const cell = { gridBlockId: 'grid-1', cellIndex: 0, blocks: [{ kind: 'paragraph', text: 'Replaced the cell' }] };
    const refused = await call('set_cell', cell);
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toContain('w-cell (retiredWidget)');
    expect(textOf(refused)).toContain('acknowledgeDropped');
    expect(holds(await storedDoc(id), 'Replaced the cell')).toBe(false);
    const taken = await call('set_cell', { ...cell, acknowledgeDropped: ['w-cell'] });
    expect(taken.isError).toBeFalsy();
    expect(holds(await storedDoc(id), '"w-cell"')).toBe(false);
    expect(holds(await storedDoc(id), 'Replaced the cell')).toBe(true);

    // Naming the unknown block by its id is acknowledgement enough.
    const replaced = await call('update_block', { blockId: 'w-top', block: { kind: 'paragraph', text: 'In its place' } });
    expect(replaced.isError).toBeFalsy();
    const after = await storedDoc(id);
    expect(after.content.find((node) => node.attrs?.blockId === 'w-top')?.type).toBe('paragraph');
    expect(holds(after, 'retiredWidget')).toBe(false);
  });

  it('restores a version that lacks one only when the restore names it', async () => {
    const { id } = await guardedPage();
    const versionId = await captureStandaloneVersion({ nodeType: 'page', nodeId: id, payload: doc(textPara('p-old', 'An older page')), kind: 'manual' });

    const refusal = await restoreVersion(versionId, null).catch((e: unknown) => e);
    expect(isUnknownDropped(refusal)).toBe(true);
    expect(isUnknownDropped(refusal) && refusal.details.dropped.map((unit) => unit.key).sort()).toEqual(['w-cell', 'w-top']);
    expect(holds(await storedDoc(id), 'An older page')).toBe(false);
    expect(holds(await storedDoc(id), '"w-top"')).toBe(true);

    expect(await restoreVersion(versionId, null, { acknowledgeDropped: ['w-top', 'w-cell'] })).toBe(true);
    const after = await storedDoc(id);
    expect(holds(after, 'An older page')).toBe(true);
    expect(holds(after, 'retiredWidget')).toBe(false);
  });

  // An id-less unknown block is keyed by its fingerprint, which the sanitizer
  // changes here by dropping the link's target. Seeded straight into the
  // database, unsanitized.
  const legacyWidget = (): Node => ({
    type: 'retiredWidget',
    content: [textPara('p-in', 'Linked', [{ type: 'link', attrs: { href: 'https://example.org/', target: '_blank' } }])],
  });
  const legacyPage = async (title: string) => {
    const page = await adminPage(title);
    await db`update pages set doc = ${db.json(doc(textPara('p-first', 'First'), legacyWidget()) as unknown as JsonArg)} where id = ${page.id}`;
    return page;
  };

  it('reads one the sanitizer rewrites as the same block on both sides, and still refuses losing it', async () => {
    const { id } = await legacyPage('Legacy');
    await saveDoc(id, doc(textPara('p-first', 'First save'), legacyWidget()));
    expect(holds(await storedDoc(id), '_blank')).toBe(false);
    await saveDoc(id, doc(textPara('p-first', 'Second save'), legacyWidget()));
    expect(holds(await storedDoc(id), 'Second save')).toBe(true);
    expect(holds(await storedDoc(id), 'retiredWidget')).toBe(true);

    // The other way round: stored unsanitized, written sanitized.
    const other = await legacyPage('Legacy, written clean');
    const clean = { ...legacyWidget(), content: [textPara('p-in', 'Linked', [{ type: 'link', attrs: { href: 'https://example.org/' } }])] };
    await saveDoc(other.id, doc(textPara('p-first', 'Clean save'), clean));
    expect(holds(await storedDoc(other.id), 'Clean save')).toBe(true);

    const refusal = await saveDoc(id, doc(textPara('p-first', 'Without it'))).catch((e: unknown) => e);
    expect(isUnknownDropped(refusal) && refusal.details.dropped.map((unit) => unit.type)).toEqual(['retiredWidget']);
    expect(holds(await storedDoc(id), 'Without it')).toBe(false);
  });

  it('lets one the sanitizer rewrites go when the writer names it by its key as it loaded it, or as the refusal named it', async () => {
    const loaded = await legacyPage('Legacy, deleted');
    await saveDoc(loaded.id, doc(textPara('p-first', 'Deleted')), { acknowledgeDropped: [...unknownKeys(legacyWidget() as JsonNode).keys()] });
    expect(holds(await storedDoc(loaded.id), 'retiredWidget')).toBe(false);

    const { id } = await legacyPage('Legacy, named');
    const refusal = await saveDoc(id, doc(textPara('p-first', 'Named'))).catch((e: unknown) => e);
    expect(isUnknownDropped(refusal)).toBe(true);
    const keys = isUnknownDropped(refusal) ? refusal.details.dropped.map((unit) => unit.key) : [];
    await saveDoc(id, doc(textPara('p-first', 'Named')), { acknowledgeDropped: keys });
    expect(holds(await storedDoc(id), 'retiredWidget')).toBe(false);
  });

  it('takes a lost draft’s pick that holds one as its editor loaded it, after another save rewrote it', async () => {
    const admin = await userOf('admin');
    const page = await adminPage('Legacy, picked');
    const grid = (text: string): Node => ({
      type: 'grid',
      attrs: { blockId: 'grid-1', columnWidths: [1] },
      content: [{ type: 'gridCell', content: [textPara('p-cell', text), legacyWidget()] }],
    });
    await db`update pages set doc = ${db.json(doc(grid('Stored')) as unknown as JsonArg)} where id = ${page.id}`;
    await saveDoc(page.id, doc(grid('Saved by the one who took over')));

    const { token } = await acquireLock(page.id, admin.id);
    const picks = [{ blockId: 'grid-1', op: 'replace' as const, block: grid('The draft') }];
    expect(await applyPicksToPage(page.id, picks, { lockToken: token!, authorId: admin.id })).toEqual({ ok: true });
    expect(holds(await storedDoc(page.id), 'The draft')).toBe(true);
    expect(holds(await storedDoc(page.id), 'retiredWidget')).toBe(true);
  });
});

// docs/architecture/theming.md. The site default is not changed here.
describe('the colour-scheme readiness report', () => {
  it('lists a page that follows the site default and picks a text colour, and keeping pages light pins it so the report no longer lists it', async () => {
    const admin = await userOf('admin');
    const picked = { type: 'paragraph', attrs: { typography: { desktop: { color: '#1e293b' } } }, content: [txt('Picked for a light page')] };
    const page = await adminPage('Slate text', doc(picked));

    const before = await siteReadiness(admin);
    expect(before.pages.find((p) => p.id === page.id)).toMatchObject({ title: page.title, text: 1, border: 0, html: 0 });

    expect(await keepPagesLight(admin, [page.id])).toBe(1);
    expect(await getPageContentScheme(page.id)).toBe('light');
    const after = await siteReadiness(admin);
    expect(after.pages.map((p) => p.id)).not.toContain(page.id);
    expect([after.inheriting, after.pinned]).toEqual([before.inheriting - 1, before.pinned + 1]);
    expect(await keepPagesLight(admin, [page.id])).toBe(0);
  });
});

// assertPageAssetRefs: another page's image would render by that page's permissions.
describe('an agent’s background images', () => {
  const PNG = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

  it('refuses a block or style that points a background image at an asset another page owns, leaving the page as it was', async () => {
    const page = await adminPage(
      'Hero',
      doc(textPara('p-first', 'First paragraph'), {
        type: 'grid',
        attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
        content: [
          { type: 'gridCell', content: [textPara('p-left', 'Left column')] },
          { type: 'gridCell', content: [textPara('p-right', 'Right column')] },
        ],
      })
    );
    const agent = await connectAs('admin');
    const call = (name: string, args: Record<string, unknown>) => agent.callTool({ name, arguments: { pageId: page.id, ...args } });
    const foreign = seed.publicAssetId;
    const surface = (image: string) => ({ desktop: { image, overlay: 'token:inverse', overlayOpacity: 70 } });
    const hero = (image: string) => ({ kind: 'grid', columns: 1, width: 'full', surface: surface(image), cells: [[{ kind: 'paragraph', text: 'Over the image' }]] });
    const before = await storedDoc(page.id);

    const attempts: [string, Record<string, unknown>][] = [
      ['append_block', { block: hero(foreign) }],
      ['update_block', { blockId: 'p-first', block: hero(foreign) }],
      ['set_cell', { gridBlockId: 'grid-1', cellIndex: 0, style: { surface: surface(foreign) } }],
      ['style_grid', { gridBlockId: 'grid-1', surface: surface(foreign) }],
    ];
    for (const [tool, args] of attempts) {
      const res = await call(tool, args);
      expect(res.isError, tool).toBe(true);
      expect(textOf(res), tool).toContain(`background image ${foreign} is not an image uploaded to this page`);
      expect(await storedDoc(page.id), tool).toEqual(before);
    }
    const [owner] = await db<{ owner_page_id: string }[]>`select owner_page_id from assets where id = ${foreign}`;
    expect(owner.owner_page_id).toBe(seed.publicId);

    const own = await createImageAsset({ bytes: PNG(), mime: 'image/png', ownerPageId: page.id, createdBy: (await userOf('admin')).id });
    const styled = await call('style_grid', { gridBlockId: 'grid-1', surface: surface(own.id) });
    expect(styled.isError, textOf(styled)).toBeFalsy();
    expect(holds(await storedDoc(page.id), own.id)).toBe(true);
  });
});

describe('deleting a page', () => {
  it('removes its versions and every link to and from it', async () => {
    const other = await adminPage('Linked from');
    const page = await adminPage('Doomed', doc(textPara('p-out', 'Out to the other', [pageLink(other)])));
    const linking = await adminPage('Links in', doc(textPara('p-in', 'In to the doomed', [pageLink(page)])));
    await captureStandaloneVersion({ nodeType: 'page', nodeId: page.id, payload: doc(textPara('p-kept', 'A version of it')), kind: 'manual' });

    const versionIds = async (id: string) => (await db<{ id: string }[]>`select id from node_versions where node_id = ${id}`).map((r) => r.id);
    const ids = await versionIds(page.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const linksOf = (id: string) => db`select 1 from edges where source_id = ${id} or target_id = ${id}`;
    expect(await linksOf(page.id)).toHaveLength(2);
    const othersVersions = await versionIds(linking.id);

    expect(await deletePage(page.id)).toBe(true);

    expect(await db`select 1 from nodes where id = ${page.id}`).toHaveLength(0);
    expect(await versionIds(page.id)).toEqual([]);
    expect(await db`select 1 from page_versions where version_id in ${db(ids)}`).toHaveLength(0);
    expect(await linksOf(page.id)).toHaveLength(0);
    expect(await db`select 1 from nodes where id in ${db([other.id, linking.id])}`).toHaveLength(2);
    expect(await versionIds(linking.id)).toEqual(othersVersions);
  });
});

describe('restoring a version', () => {
  it('makes its document the page’s current one and records a forward version, so the restore can itself be undone', async () => {
    const author = (await userOf('editorA')).id;
    const page = await adminPage('Restored');
    await saveDoc(page.id, doc(textPara('p-v', 'The first draft')), { authorId: author, versionKind: 'manual' });
    await saveDoc(page.id, doc(textPara('p-v', 'The second draft')), { authorId: author, versionKind: 'manual' });
    const [second, first] = await listVersions(page.id);

    expect(await restoreVersion(first.id, author)).toBe(true);
    const current = await storedDoc(page.id);
    expect(holds(current, 'The first draft')).toBe(true);
    expect(holds(current, 'The second draft')).toBe(false);

    const history = await listVersions(page.id);
    expect(history.map((v) => v.id).slice(1)).toEqual([second.id, first.id]);
    expect(history[0].versionNo).toBe(second.versionNo + 1);
    expect(holds((await getVersion(history[0].id))?.payload, 'The first draft')).toBe(true);
    expect(holds((await getVersion(second.id))?.payload, 'The second draft')).toBe(true);

    expect(await restoreVersion(second.id, author)).toBe(true);
    expect(holds(await storedDoc(page.id), 'The second draft')).toBe(true);
  });

  // A same-author autosave within two minutes would collapse into the last one.
  it('records a forward version right after the restorer’s own autosave too', async () => {
    const author = (await userOf('editorA')).id;
    const page = await adminPage('Restored after an autosave');
    await saveDoc(page.id, doc(textPara('p-v', 'The first draft')), { authorId: author, versionKind: 'manual' });
    await saveDoc(page.id, doc(textPara('p-v', 'The autosaved draft')), { authorId: author });
    const [autosaved, first] = await listVersions(page.id);
    expect(autosaved.kind).toBe('autosave');

    expect(await restoreVersion(first.id, author)).toBe(true);
    expect(holds(await storedDoc(page.id), 'The first draft')).toBe(true);
    const history = await listVersions(page.id);
    expect(history.map((v) => v.id).slice(1)).toEqual([autosaved.id, first.id]);
    expect(history[0].kind).toBe('manual');
    expect(holds((await getVersion(autosaved.id))?.payload, 'The autosaved draft')).toBe(true);
  });
});

// POST /api/pages/[id]/versions hands the editor's doc, placeholders and all,
// to captureStandaloneVersion as here.
describe('a lost draft kept as a version', () => {
  it('is stored without the editor’s placeholders', async () => {
    const page = await adminPage('Lost draft');
    const placeholder = (blockId: string): Node => ({ type: 'placeholder', attrs: { blockId } });
    const draft = doc({
      type: 'flexContainer',
      attrs: { blockId: 'f-1' },
      content: [
        { type: 'flexCell', content: [textPara('p-1', 'In a cell')] },
        { type: 'flexCell', content: [placeholder('ph-cell')] },
      ],
    });
    const versionId = await captureStandaloneVersion({ nodeType: 'page', nodeId: page.id, payload: draft, kind: 'lost_draft' });

    const version = (await getVersion(versionId))?.payload;
    expect(holds(version, 'In a cell')).toBe(true);
    expect(holds(version, 'placeholder')).toBe(false);
  });
});
