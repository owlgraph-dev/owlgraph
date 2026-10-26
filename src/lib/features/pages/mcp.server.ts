// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Page tools: listing/creating pages and block-level editing of one page.
import { z } from 'zod';
import type { ToolRegistry, ToolResult } from '../../../mcp/registry';
import { text, errText } from '../../../mcp/registry';
import { logEvent } from '$lib/platform/logger.server';
import { blockShape, leafBlockShape, cellStyleShape, pageSettingsShape, spacingShape, containerSurfaceShape, minHeightShape, columnsByTierShape, gapByTierShape } from '$lib/features/content/server';
import {
  listPagesForUser,
  createPage,
  listBlocks,
  appendBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  editCell,
  styleGrid,
  assertPageAssetRefs,
  setPageContentScheme,
  setPageSettings,
} from '$lib/features/pages/server';
import { setNodeLocale } from '$lib/features/nodes/server';
import { listPageLayoutPresets } from './pageLayoutPresets.server';
import { pageAttrsOf, pageColumnsOf, pageGround, pageGutter, pageWidth, CUSTOM_PRESET_ID, STANDARD_PRESET_ID, EMBED_KINDS } from '$lib/features/content';
import { presetName, resolvePageLayoutPreset } from './pageLayoutPresets';
import { getCollection, resolveCollectionBlocks, userCanReadCollection } from '$lib/features/collections/server';
import { getDocument, resolveDocumentBlocks, userCanReadDocument } from '$lib/features/documents/server';
import { createPluginHost } from '$lib/features/pluginHost/server';
import { renderPage } from '$lib/features/reader/server';
import { isUuid } from '$lib/features/nodes';
import { pluginInputDescriptions, pluginInputKindOfBlock } from '$lib/plugins/inputs.server';
import { getLocale } from '$lib/paraglide/runtime';
import type { CollectionBlockData, DocumentBlockData } from '$lib/features/content';
import type { WriterRefs } from '$lib/features/pages/server';
import { describeDropped, droppedSummary, isUnknownDropped } from './unknownGuard';

function collectionPreview(data: CollectionBlockData): string {
  if (data.state === 'hidden') return 'collection (not readable)';
  if (data.state === 'unavailable') return `collection "${data.node.title}" (mirrored by an integration)`;
  return `collection "${data.node.title}" · ${data.total} ${data.total === 1 ? 'entry' : 'entries'}`;
}

function documentPreview(data: DocumentBlockData): string {
  if (data.state === 'hidden') return 'document (not readable)';
  if (data.state === 'unavailable') return `document "${data.node.title}" (kept by an integration)`;
  return `document "${data.node.title}" · ${data.file?.filename ?? data.linkHost ?? 'link'}`;
}

const acknowledgeDroppedShape = z
  .array(z.string())
  .optional()
  .describe(
    "Keys of blocks this server can't show (get_page lists them as 'unknown block (<type>)': a removed plugin's, another version's) that this change may remove on purpose — the keys a refusal names. Without them, a change that would remove one is refused and nothing is changed."
  );

const EMBEDS_DESCRIPTION =
  "COLLECTIONS AND DOCUMENTS: kind:'collection' {nodeId, limit?, density?, showLabels?, columns?} embeds a curated collection's members in their order (find ids with get_collection or search) — at most `limit` (default 20) with a link to the collection's own page for the rest; kind:'document' {nodeId, variant?: 'row'|'card', titleMode?, preview?, showMeta?, showDownload?, showNodeLink?} embeds an uploaded or linked document (list_documents, search). Both take placement, surface, spacing and typography like a quick link. Every reader sees what THEY may read: a member they may not read is left out, and a collection or document they may not read renders nothing at all — whoever embedded it. A page is not found by what it embeds; the collection and the document are. Nodes an integration keeps have kinds of their own:";

export function registerPageTools({ user, log, tool, pageTool }: ToolRegistry): void {
  // Read as the agent: an embedding block shows only a node the agent may read,
  // and a plugin's block reads through the plugin's host as the agent.
  const writer: WriterRefs = {
    embedKindOf(plugin, family) {
      const kind = EMBED_KINDS.find((k) => k.family === family && k.source === plugin);
      return kind ? pluginInputKindOfBlock(kind.kind) : null;
    },
    async resolveEmbedTarget(id) {
      if (!isUuid(id)) return null;
      const collection = await getCollection(id);
      if (collection) return (await userCanReadCollection(user, collection)) ? { id, type: 'collection', plugin: collection.plugin } : null;
      const document = await getDocument(id);
      if (document) return (await userCanReadDocument(user, document)) ? { id, type: 'document', plugin: document.plugin } : null;
      return null;
    },
    pluginHost: (pluginId) => createPluginHost(pluginId, { user, locale: getLocale(), log }),
  };

  // An unknown-block refusal (unknownGuard.ts), told by key; anything else is
  // rethrown. `acknowledgeable`: whether this tool takes the keys back.
  const refused = (pageId: string, e: unknown, acknowledgeable: boolean): ToolResult => {
    if (!isUnknownDropped(e)) throw e;
    logEvent(log, 'page.unknown_drop_refused', { pageId, via: 'mcp', ...droppedSummary(e.details.dropped) });
    const keys = e.details.dropped.map((unit) => JSON.stringify(unit.key)).join(', ');
    return errText(
      `Nothing was changed: this would remove blocks this server can't show — ${describeDropped(e.details.dropped)}. They belong to a plugin that isn't installed or to another version of the app, and nothing can bring them back once removed.` +
        (acknowledgeable ? ` To remove them on purpose, call again with acknowledgeDropped: [${keys}].` : '')
    );
  };

  tool(
    'list_pages',
    { title: 'List pages', description: 'List the pages you can access (id, slug, title, visibility).', inputSchema: {} },
    'page:read',
    async () => {
      const pages = await listPagesForUser(user);
      return text(JSON.stringify(pages.map((p) => ({ id: p.id, slug: p.slug, title: p.title, visibility: p.visibility })), null, 2));
    }
  );

  tool(
    'create_page',
    {
      title: 'Create page',
      description: "Create a new empty page (it follows its namespace's access level; you become its owner).",
      inputSchema: { title: z.string(), locale: z.string().optional().describe("The language the content is in — an enabled language code such as 'de' or 'en' (not the interface language); it decides how full-text search indexes the content. Default: the site default language.") },
    },
    'page:write',
    async ({ title, locale }) => {
      try {
        const page = await createPage(title, user, { locale });
        return text(`Created page ${page.id} (slug: ${page.slug}, content language: ${page.locale})`);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === 'locale_not_enabled') return errText(err.message);
        throw e;
      }
    }
  );

  pageTool(
    'get_page',
    {
      title: 'Get page',
      description:
        "Return a page title, its content language (locale: the language the content is in, e.g. 'de' — see set_page_locale), its colour scheme (contentScheme: 'light' | 'dark' | 'adaptive', or null for the site default — see set_page_content_scheme), its own page settings (settings: layout — the id of the site's page layout its values came from, 'standard' for a flow or 'custom' — with layoutLabel and layoutCustomized (true when the page's values differ from that layout's), its columns and columnGap on a columns page, readWidth, wideWidth, gutters per tier, background, blockSpace — each 'auto' when the page follows the site; see set_page_layout) and its blocks (id, type, preview). Use block ids with update_block / delete_block.",
      inputSchema: { pageId: z.string() },
    },
    'read',
    async (page) => {
      const own = pageAttrsOf(page.doc as { attrs?: Record<string, unknown> } | null);
      const columns = pageColumnsOf(own.layout);
      // Resolved as the editor shows it.
      const { preset, customized } = resolvePageLayoutPreset(columns, await listPageLayoutPresets());
      const settings = {
        layout: preset?.id ?? (columns ? CUSTOM_PRESET_ID : STANDARD_PRESET_ID),
        // In the request's interface language.
        layoutLabel: preset ? presetName(preset) : null,
        layoutCustomized: customized,
        ...(columns ? { columns: columns.template, columnGap: columns.gap ?? {} } : {}),
        readWidth: pageWidth(own.layout, 'read') ?? 'auto',
        wideWidth: pageWidth(own.layout, 'wide') ?? 'auto',
        gutters: {
          desktop: pageGutter(own.layout, 'desktop') ?? 'auto',
          tablet: pageGutter(own.layout, 'tablet') ?? 'auto',
          phone: pageGutter(own.layout, 'phone') ?? 'auto',
        },
        background: pageGround(own.surface) ?? 'auto',
        blockSpace: own.spacing.desktop?.blockSpace ?? 'auto',
      };
      // Embedded nodes are named as the agent may read them.
      const [blocks, collections, documents] = await Promise.all([listBlocks(page.id), resolveCollectionBlocks(page.doc, user, log), resolveDocumentBlocks(page.doc, user, log)]);
      const described = blocks.map((block) => {
        const id = String(block.blockId);
        return collections[id] ? { ...block, preview: collectionPreview(collections[id]) } : documents[id] ? { ...block, preview: documentPreview(documents[id]) } : block;
      });
      return text(JSON.stringify({ title: page.title, locale: page.locale, contentScheme: page.content_scheme, settings, blocks: described }, null, 2));
    }
  );

  pageTool(
    'get_page_html',
    {
      title: 'Get page HTML',
      description:
        'Return the page rendered to final, sanitized HTML — the exact output a reader sees, with html blocks fully expanded. Use this to reason about how the page actually looks (layout, tables, styled html blocks). To edit, pair with get_page for block ids and indices.',
      inputSchema: { pageId: z.string() },
    },
    'read',
    async (page) => {
      const { html, css } = await renderPage(page, { kind: 'agent', user, log });
      // The stylesheet the markup's `data-b` points into leads, so the HTML stays self-describing.
      return text(
        (css ? `<style>${css}</style>\n` : '') + html
      );
    }
  );

  pageTool(
    'append_block',
    { title: 'Append block', description: "Append a typed block (heading/paragraph/callout/code/html/quickLink/list/table/diagram/collection/document/grid/flex/section, and an integration's kinds — see COLLECTIONS AND DOCUMENTS) to the end of a page. SECTIONS: on a page with a column layout (get_page settings.layout other than 'standard'; see set_page_layout) the content is sections — append kind:'section' with cells in column order, main first, e.g. {kind:'section', cells:[[{kind:'paragraph',text:'…'}],[{kind:'quickLink',…}]]}: one section per paragraph and the image or note that belongs beside it, so a phone shows each pair together. A section has no columns of its own (they are the page's; its cells are padded or merged to that count); it takes width ('normal'|'wide'|'full'), columns:'single' (one column, e.g. a title band), bleedToTop, spacing, surface and cellStyles. Fill a section's cells later with set_cell and style it with style_grid, like a grid. A block that is not a section, appended to such a page, is put into a section of its own (main column). Prefer structured 'list'/'table' over html. PARAGRAPH STYLES: a heading or paragraph is set in one of the site's paragraph styles (list_paragraph_styles) — a style names the element (p, h1–h6) and its look at once. Pass its id as `style` on the block to choose it; a bare heading `level` (or a plain paragraph) gets that element's default style. Check list_paragraph_styles before choosing a level when the site may offer more than the plain hierarchy (a display title, a label style). STYLES: before hand-writing CSS or inline colours in an html block, call list_custom_styles — the site's named styles are applied with a class, already follow the reader's colour scheme, and keep one look in one place. LIST FORMATTING: a 'list' block may set listStyle (bullets: 'disc'|'circle'|'square'|'none'; ordered: 'decimal'|'lower-alpha'|'upper-alpha'|'lower-roman'|'upper-roman'|'none') and spacing ('tight'|'normal'|'loose'). A 'diagram' block renders a Mermaid diagram from its code (e.g. flowcharts, sequence diagrams). Inside heading/paragraph/callout/list text, embed inline links with [[targetPageId|link text]] — these become hyperlinks AND knowledge-graph edges. To cite a DOCUMENT (from list_documents/search) instead of a page, embed [[doc:<documentId>|link text]] — this links to the document viewer and records a page→document edge. SEMANTIC PROPERTIES: annotate a fact inline as {{{property_name:value}}} (e.g. {{{deadline:2025-03-01}}}). IMPORTANT: only the VALUE is shown to readers — property_name is machine-readable metadata and is NOT rendered on the page. So always give the value human context: either embed it in a sentence (e.g. 'This runbook must be reviewed by {{{deadline:2025-03-01}}}.'), or write your own visible label as normal text (e.g. 'Status: {{{status:Active}}}' renders to readers as 'Status: Active'). NEVER make a block whose only content is {{{...}}} — readers would see just a bare value with no context. Properties are namespaced (group:property, e.g. 'core:deadline'); this {{{name:value}}} syntax always lands in the default 'core' group, so the name you type is stored as 'core:name' — use list_property_names/list_property_definitions to see existing names in their stored (namespaced) form. A 'quickLink' block is a quick link to a page (targetPageId), a document (targetDocId), or an address (url): an external URL, or a path on this site such as /search (the search page; /search?class=<class key> lists a class and its subclasses, /search?tag=<tag> a tag), which opens in the same tab; give it a label, a variant ('link' — text with an underline, the default; 'outlined' — a border, no fill; 'button' — filled), whose colours come from the site's block defaults for cards else the theme, an optional surface to fine-tune only the fields that look carries (a button's background, an outline's border, radius, shadow — grouped by tier, e.g. { desktop: { bg: 'token:brand.<id>' } } on a button), an optional icon (a key such as 'link','external-link','file-text','book-open','arrow-right','folder','star','mail','calendar','users','globe','download','info','grid','layers','database','clock','image','tag','briefcase'), and iconPosition ('left'|'top'). Put several quick links in a grid (one per cell) to build a quick-links panel. To link a page that doesn't exist yet, call create_page first. GRIDS: kind:'grid' arranges blocks in a responsive CSS grid. Give columnWidths as relative column weights (e.g. [2,1] = two columns, the first twice as wide) OR columns as a count for equal widths. 'cells' is a ROW-MAJOR array of cells; each cell is an array of blocks of ANY kind EXCEPT 'grid', 'flex' and 'section' (containers cannot nest). The grid fills left→right, top→bottom, so 2 columns with 4 cells makes 2 rows; cells may be empty ([]). Inline links and semantic properties work inside cells. Example: {kind:'grid', columnWidths:[2,1], cells:[ [{kind:'heading',level:2,text:'Overview'},{kind:'paragraph',text:'Main column...'}], [{kind:'callout',variant:'info',text:'Sidebar note'}] ]}. ON A PHONE a grid stacks its cells in one column unless it says otherwise, and a tablet keeps the desktop's columns: give columnsByTier (e.g. { phone: [1, 1] }) and gapByTier for a composition that should stay side by side — an icon beside its text, figures in a 2 × 2 block; leave it out for prose columns, which should stack. STYLING (optional, for on-brand bands/heroes): the grid takes surface (background/border/radius/shadow, grouped by tier, e.g. { desktop: { bg: 'token:inverse', radius: 8 } }), gap ('none'|'sm'|'md'|'lg'), spacing (grouped by tier: pad, the padding in px, e.g. { desktop: { pad: 16 } }; blockSpace, the rhythm the blocks inside take; spaceAbove, the block's own space above), and rowHeights (an array of px floors, one per row, e.g. [220] — a row grows past this if its content is taller, so it's a floor, not a fixed height); and cellStyles (an array aligned to cells) where each entry is {surface, typography, spacing, alignX:'start'|'center'|'end', alignY:'start'|'center'|'end'}. typography sets font family/size/color/weight, grouped by tier (e.g. { desktop: { color: 'token:on-inverse', weight: 'semibold', size: 'scale:xl' } }); family must be one of 'sans'|'serif'|'mono' (curated system stacks — not a raw CSS font string). SIZES: prefer a type-scale step, written 'scale:<step>' — xs, s, m, l, xl, 2xl, 3xl, 4xl, 5xl, 6xl (body text is m, a page title 4xl) — which follows the reader's font-size setting, and 3xl and up shrink on a narrow screen; a px number (8–96) is a deliberate fixed size that does neither. Cells automatically stretch to fill their row's height, so alignY positions content vertically within that filled space. COLOURS (bg, border, typography color): prefer a theme colour, written 'token:<name>' — text, muted, border, border-strong, background, subtle, accent, accent-soft, on-accent, inverse, on-inverse, info, info-soft, success, success-soft, warning, warning-soft, danger, danger-soft — which follows each reader's light or dark scheme. Pair a filled background with the text colour made for it: token:accent (or info/success/warning/danger) with token:on-accent, token:inverse with token:on-inverse, a -soft or subtle background with token:text. A hex/rgb literal is the same fixed colour in both schemes: only pair a literal background with a literal text colour that reads on it. For a full-width hero band, use a single column ({columnWidths:[1]}) with rowHeights:[220], one cell given surface bg 'token:inverse' and typography.color 'token:on-inverse', spacing:{desktop:{pad:24}}, alignX:'center' and alignY:'center'. BACKGROUND IMAGES AND HEROES: the surface of a grid, a section or a cell may carry a background image — image is the asset id of an image uploaded to THIS page in the editor (get_page's rendered output shows a page's asset ids in its /api/media/<id> URLs; you cannot upload, and an id from another page is refused) — with imageFit ('cover' default | 'contain' | 'repeat'), imageFocus (the part that stays in view when cropped), an overlay colour laid over it with overlayOpacity (0–100, default 50) so text on it reads, and imageScheme ('light' | 'dark'; omitted = decided from the overlay: a dark overlay gives light text; with no overlay text keeps the page's scheme and may not read — so set an overlay or a scheme). A tier may bring its own image (a portrait crop on phone) or only move the focus. bg stays as the colour shown while the image loads. For a hero prefer a SECTION (on a columns page, columns:'single', width:'full'; on a standard page a single-column grid with width:'full') with the image, an overlay such as 'token:inverse' at 70 (its text is then on-inverse, readable over any photo), and minHeight (e.g. { desktop: '560px', phone: '70svh' }) rather than rowHeights; a cell's alignY:'center' centres the text in that height. SECTION WIDTH: set width ('normal'|'wide'|'full') on the grid to control how wide the band is — 'normal' sits in the reading column (default), 'wide' is a wider band, and 'full' spans the page canvas edge-to-edge (use 'full' for hero/portal bands). AUTO IS THE DEFAULT: every surface/spacing/typography field you omit stays Auto — the site's block defaults (the capability defaults: padding, corners, shadow, border, background, rhythm per block-type group) and the paragraph style's look apply, and they follow the theme. Set a field only to deviate from them; never restate a default. FLEX ROWS: kind:'flex' is a row of cells that size to their content and flow — a row of buttons, a strip of logos, a row of tags, an icon beside its text — where a grid fixes columns. 'cells' lists the cells in order, each an array of blocks of any kind except 'grid', 'flex' and 'section'; a cell may be empty ([]). Example, a centred button row: {kind:'flex', placement:{desktop:{align:'center'}}, layout:{desktop:{gap:12, flexWrap:'wrap'}}, cells:[ [{kind:'quickLink', url:'https://…', label:'Get started', variant:'button'}], [{kind:'quickLink', url:'https://…', label:'Learn more', variant:'outlined'}] ]}. layout arranges the row per tier (tablet and phone inherit the larger tier): flexDirection 'row' (default) | 'column'; flexWrap 'nowrap' (default: one line, the cells get narrower) | 'wrap' (breaks into lines) | 'scroll' (one line that scrolls sideways in its own box — a logo strip on a phone: { phone: { flexWrap: 'scroll' } }); justifyContent ('flex-start' default, 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'); alignItems ('stretch' default, 'flex-start', 'center', 'flex-end', 'baseline'); gap in px. A row stays a row on a phone unless its phone layout says otherwise. A cell is as wide as its content; cellStyles (aligned to cells) give each a flexItem per tier — size 'fill' shares the free space by weight (1–3), size 'fixed' with basis ('140px', '10rem', '25%') gives it a width of its own, self aligns it across the row — and typography, spacing and surface as for a grid cell. The row takes width, placement ('start'|'center'|'end' make it as wide as its content and put it there), spacing, surface, minHeight and bleedToTop as a grid does. get_page lists a row's cells under `cellContents`; to change a row, replace it with update_block. INCREMENTAL EDITING: instead of one big payload, you can append a grid with empty cells ([]) and then fill/style it cell by cell with set_cell (content and/or per-cell style, addressed by 0-based cellIndex — get_page lists each cell under `cellContents` with its index and preview) and adjust the grid with style_grid (surface/gap/spacing/width). To restructure (change column or cell count), replace the whole grid with update_block (give its block id). " + [EMBEDS_DESCRIPTION, ...pluginInputDescriptions()].join(' '), inputSchema: { pageId: z.string(), block: blockShape } },
    'write',
    async (page, { block }) => {
      await assertPageAssetRefs(page.id, block);
      try {
        return text(`Appended block ${await appendBlock(page.id, block, writer)}`);
      } catch (e) {
        return refused(page.id, e, false);
      }
    }
  );

  pageTool(
    'update_block',
    { title: 'Update block', description: "Replace a block (by id) with new typed content. Text blocks support inline page links via [[targetPageId|link text]] and document links via [[doc:documentId|link text]], and take a paragraph `style` id from list_paragraph_styles (see append_block). To edit a grid or a flex row, pass a full kind:'grid' or kind:'flex' block here (it replaces the whole container, cells and all) — get_page reports each grid's column count and cell count, and each container's cells under `cellContents`. A block this server can't show ('unknown block') may be replaced by its id; one inside the block you replace is removed only when acknowledgeDropped names it.", inputSchema: { pageId: z.string(), blockId: z.string(), block: blockShape, acknowledgeDropped: acknowledgeDroppedShape } },
    'write',
    async (page, { blockId, block, acknowledgeDropped }) => {
      await assertPageAssetRefs(page.id, block);
      try {
        await updateBlock(page.id, blockId, block, writer, acknowledgeDropped);
      } catch (e) {
        return refused(page.id, e, true);
      }
      return text(`Updated block ${blockId}`);
    }
  );

  pageTool(
    'delete_block',
    {
      title: 'Delete block',
      description:
        "Delete a block by id. A block this server can't show ('unknown block') is deleted by its id like any other; one inside the block you delete is removed only when acknowledgeDropped names it.",
      inputSchema: { pageId: z.string(), blockId: z.string(), acknowledgeDropped: acknowledgeDroppedShape },
    },
    'write',
    async (page, { blockId, acknowledgeDropped }) => {
      try {
        await deleteBlock(page.id, blockId, acknowledgeDropped);
      } catch (e) {
        return refused(page.id, e, true);
      }
      return text(`Deleted block ${blockId}`);
    }
  );

  pageTool(
    'move_block',
    {
      title: 'Move block',
      description: 'Reorder a page by moving a block to a new 0-based position. Call get_page first to read current block indices and ids.',
      inputSchema: { pageId: z.string(), blockId: z.string(), toIndex: z.number().int().nonnegative() },
    },
    'write',
    async (page, { blockId, toIndex }) => {
      try {
        await moveBlock(page.id, blockId, toIndex);
      } catch (e) {
        return refused(page.id, e, false);
      }
      return text(`Moved block ${blockId} to index ${toIndex}`);
    }
  );

  pageTool(
    'set_cell',
    {
      title: 'Set grid cell',
      description:
        "Edit ONE cell of an existing grid in place, without disturbing the other cells — the incremental way to build complex layouts (create the grid with empty cells via append_block, then fill/style each cell). Address the cell by the grid's block id and its 0-based cellIndex; get_page lists each grid's cells under `cellContents` with their index and a text preview. Cells are row-major (left→right, top→bottom). Provide `blocks` to set the cell's content (leaf blocks only — headings/paragraphs/callouts/lists/tables/quick links/etc.; no nested layouts) and/or `style` to style the cell ({surface, typography, spacing, alignX, alignY, stretch}; a field you omit stays Auto — the site's block defaults and the paragraph style apply — so set only what should deviate). `mode` 'replace' (default) swaps the cell's content — a block in it this server can't show ('unknown block') is removed only when acknowledgeDropped names it; 'append' adds to it. Row height is set on the grid itself (rowHeights) — use update_block to change it.",
      inputSchema: {
        pageId: z.string(),
        gridBlockId: z.string(),
        cellIndex: z.number().int().nonnegative(),
        blocks: z.array(leafBlockShape).optional(),
        mode: z.enum(['replace', 'append']).optional(),
        style: cellStyleShape.optional(),
        acknowledgeDropped: acknowledgeDroppedShape,
      },
    },
    'write',
    async (page, { gridBlockId, cellIndex, blocks, mode, style, acknowledgeDropped }) => {
      await assertPageAssetRefs(page.id, style);
      try {
        await editCell(page.id, gridBlockId, cellIndex, { blocks, mode, style, acknowledgeDropped }, writer);
      } catch (e) {
        return refused(page.id, e, true);
      }
      return text(`Updated cell ${cellIndex} of grid ${gridBlockId}`);
    }
  );

  pageTool(
    'style_grid',
    {
      title: 'Style grid',
      description:
        "Update a grid's CONTAINER styling in place, without rewriting its cells: columnsByTier and gapByTier (its columns and gap on a tablet and a phone; 'auto' takes one back), surface (background/border/radius/shadow, grouped by tier — e.g. { desktop: { bg: 'token:subtle', border: 'token:border', radius: 8, shadow: 'md' } }, optionally overridden per tier with tablet/phone), gap ('none'|'sm'|'md'|'lg'), spacing (padding in px, e.g. { desktop: { pad: 16 } } for all sides, or { desktop: { pad: 16, top: 8 } } to override just one side; blockSpace sets the rhythm its cells' blocks take; optionally overridden per tier with tablet/phone). surface may also carry a background image with its overlay and scheme (see append_block, BACKGROUND IMAGES), and minHeight sets the grid's or section's minimum height per tier (e.g. { desktop: '560px', phone: '70svh' }). A field you omit stays Auto: the site's block defaults apply (the capability defaults), so set only what should deviate, and width ('normal' = reading column | 'wide' = the wide band | 'full' = span the page edge-to-edge, for hero/portal bands — the reading and wide widths are the site's, or the page's own via set_page_layout). Only the fields you pass are changed. Address the grid by its block id from get_page. To change the number of columns or cells, replace the whole grid with update_block instead.",
      inputSchema: {
        pageId: z.string(),
        gridBlockId: z.string(),
        surface: containerSurfaceShape,
        minHeight: minHeightShape,
        gap: z.enum(['none', 'sm', 'md', 'lg']).optional(),
        columnsByTier: columnsByTierShape,
        gapByTier: gapByTierShape,
        spacing: spacingShape,
        width: z.enum(['normal', 'wide', 'full']).optional(),
      },
    },
    'write',
    async (page, { gridBlockId, surface, minHeight, gap, columnsByTier, gapByTier, spacing, width }) => {
      await assertPageAssetRefs(page.id, { surface });
      try {
        await styleGrid(page.id, gridBlockId, { surface, minHeight, gap, columnsByTier, gapByTier, spacing, width });
      } catch (e) {
        return refused(page.id, e, false);
      }
      return text(`Styled grid ${gridBlockId}`);
    }
  );

  pageTool(
    'set_page_layout',
    {
      title: 'Set page layout',
      description:
        "Set a page's own layout settings. layout picks the page layout — the id of one of the site's page layouts (list_page_layout_presets: 'standard' is a flow of blocks, the others column layouts), or 'custom' with columns (a template per tier) and columnGap; a layout's values are copied into the page, and passing the page's own layout id again re-applies it after the site's layout changed; on a columns page the content is sections (append_block kind 'section'), each a row whose cells are the template's columns (main first), so an image sits beside its paragraph and a phone reads paragraph → image. Changing the layout rewrites the content as described under layout, never losing any; the result reports merges. The other settings, apart from content: readWidth (the reading column every block without a section width of its own sits in), wideWidth (how wide sections with width 'wide' get), both in px or rem, gutters (the side margin per tier, also the side padding of 'full' sections), background (the whole page's ground, a theme colour) and blockSpace (the page's block rhythm, px). Each is 'auto' to follow the site's value (its capability defaults) — AUTO IS THE DEFAULT, so set only what this page should do differently; a field you omit stays as it is. A block's own width ('normal' | 'wide' | 'full') still picks which of these it spans. get_page reports the current settings.",
      inputSchema: { pageId: z.string(), ...pageSettingsShape },
    },
    'write',
    async (page, { layout, columns, columnGap, readWidth, wideWidth, gutters, background, blockSpace }) => {
      const auto = <T>(v: T | 'auto' | undefined): T | null | undefined => (v === 'auto' ? null : v);
      let merges: Awaited<ReturnType<typeof setPageSettings>>;
      try {
        merges = await setPageSettings(page.id, {
          layout,
          columns,
          columnGap,
          readWidth: auto(readWidth),
          wideWidth: auto(wideWidth),
          gutters: gutters && { desktop: auto(gutters.desktop), tablet: auto(gutters.tablet), phone: auto(gutters.phone) },
          background: auto(background),
          blockSpace: auto(blockSpace),
        });
      } catch (e) {
        return refused(page.id, e, false);
      }
      const merged = merges.length
        ? ` Merged content: ${merges.map((mg) => `section ${mg.section}: column ${mg.from.join(', ')} → ${mg.into}`).join('; ')}.`
        : '';
      return text(`Updated the layout settings of page ${page.id}.${merged}`);
    }
  );

  pageTool(
    'set_page_content_scheme',
    {
      title: 'Set page colour scheme',
      description:
        "Set the colour scheme a page's content renders in for readers: 'light' or 'dark' pins it; 'adaptive' follows each reader's own light/dark scheme; null returns to the site default. A colour you set on a block (typography color, surface bg or border) stays that exact colour in both schemes, so an adaptive page only reads well if such colours keep their contrast on a light and on a dark page: leave text colours unset where you can, or set a text colour only inside a block whose background you also set.",
      inputSchema: { pageId: z.string(), contentScheme: z.enum(['light', 'dark', 'adaptive']).nullable() },
    },
    'write',
    async (page, { contentScheme }) => {
      await setPageContentScheme(page.id, contentScheme);
      return text(`Set the colour scheme of page ${page.id} to ${contentScheme ?? 'the site default'}`);
    }
  );

  pageTool(
    'set_page_locale',
    {
      title: 'Set page content language',
      description:
        "Set the language a page's content is in — an enabled language code such as 'de' or 'en'. Not the interface language: it decides how full-text search indexes the page, the content's lang attribute, and the language its query blocks render dates and labels in. The page is re-indexed at once.",
      inputSchema: { pageId: z.string(), locale: z.string() },
    },
    'write',
    async (page, { locale }) => {
      try {
        await setNodeLocale(page.id, locale);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === 'locale_not_enabled') return errText(err.message);
        throw e;
      }
      return text(`Set the content language of page ${page.id} to ${locale}`);
    }
  );
}
