// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The footer's legal links (footer_links, the legal line), legal text and
// branding. Its columns live in the shared tree (navTree.server.ts), its
// background in the site theme.
import { db } from '$lib/platform/db.server';
import { readablePageIds } from '$lib/features/pages/server';
import { getSetting, setSetting } from '$lib/platform/settings.server';
import { namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { getCurrentLogo } from './branding.server';
import { listTreeAdmin, buildAdminTree, resolveTreeForUser, resolveNavLinkRow, type NavLinkRow } from './navTree.server';
import type { TreeNodeAdminWithChildren, ResolvedTreeGroup, ResolvedTreeNode } from './types';
import type { SessionUser } from '$lib/features/auth/server';

import type { FooterTargetType, FooterLinkRow, FooterLinkAdminRow, FooterLinkInput, FooterBrandingSettings, ResolvedFooterLink, ResolvedFooterBranding, ResolvedFooter } from './types';
import { CodedError } from '$lib/platform/codedError';
export type { FooterTargetType, FooterLinkRow, FooterLinkAdminRow, FooterLinkInput, FooterBrandingSettings, ResolvedFooterLink, ResolvedFooterBranding, ResolvedFooter };

const KEY_LEGAL_TEXT = 'footer_legal_text';
const KEY_BRANDING_SHOW_LOGO = 'footer_branding_show_logo';
const KEY_BRANDING_TITLE = 'footer_branding_title';
const KEY_BRANDING_TAGLINE = 'footer_branding_tagline';
const KEY_BRANDING_LOGO_HEIGHT = 'footer_branding_logo_height';
const DEFAULT_LOGO_HEIGHT = 32;
const MIN_LOGO_HEIGHT = 12;
const MAX_LOGO_HEIGHT = 120;

// Mirrors footer_links_target_shape_check, for a friendly error instead of a constraint violation.
function validateLinkShape(input: FooterLinkInput): { label: string; targetPageId: string | null; url: string | null } {
  const label = input.label.trim();
  if (!label) throw new CodedError('label_required', 'Label is required.');
  if (input.targetType === 'page') {
    if (!input.targetPageId) throw new CodedError('page_required', 'Choose a page.');
    return { label, targetPageId: input.targetPageId, url: null };
  }
  if (input.targetType === 'url') {
    const url = (input.url ?? '').trim();
    if (!url) throw new CodedError('url_required', 'URL is required.');
    return { label, targetPageId: null, url };
  }
  throw new CodedError('invalid_target', 'Invalid target type.');
}

const linkAdminSelect = db`
  select n.id, n.position, n.label, n.target_type, n.target_page_id, n.url, n.created_at, n.updated_at,
         pn.title as page_title, pn.slug as page_slug, ${db.unsafe(namespaceSlugColumn())}
  from footer_links n
  left join nodes pn on pn.id = n.target_page_id ${db.unsafe(namespaceJoin('pn'))}`;

export async function listFooterLegalLinksAdmin(): Promise<FooterLinkAdminRow[]> {
  return db<FooterLinkAdminRow[]>`${linkAdminSelect} order by n.position`;
}

export async function createFooterLink(input: FooterLinkInput): Promise<FooterLinkRow> {
  const shape = validateLinkShape(input);
  const [row] = await db<FooterLinkRow[]>`
    insert into footer_links (position, label, target_type, target_page_id, url)
    values (
      (select coalesce(max(position), -1) + 1 from footer_links),
      ${shape.label}, ${input.targetType}, ${shape.targetPageId}, ${shape.url}
    )
    returning id, position, label, target_type, target_page_id, url, created_at, updated_at`;
  return row;
}

export async function updateFooterLink(id: string, input: FooterLinkInput): Promise<void> {
  const shape = validateLinkShape(input);
  await db`
    update footer_links
    set label = ${shape.label}, target_type = ${input.targetType},
        target_page_id = ${shape.targetPageId}, url = ${shape.url}, updated_at = now()
    where id = ${id}`;
}

export async function deleteFooterLink(id: string): Promise<void> {
  await db`delete from footer_links where id = ${id}`;
}

// Takes the full ordered list of legal links (position has no unique constraint).
export async function reorderFooterLinks(orderedIds: string[]): Promise<void> {
  await db.begin(async (sql) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await sql`update footer_links set position = ${i}, updated_at = now() where id = ${orderedIds[i]}`;
    }
  });
}

async function getFooterLegalText(): Promise<string | null> {
  return getSetting(KEY_LEGAL_TEXT);
}

export async function setFooterLegalText(text: string | null): Promise<void> {
  await setSetting(KEY_LEGAL_TEXT, text ? text.trim() : null);
}

async function getFooterBranding(): Promise<FooterBrandingSettings> {
  const [showLogo, title, tagline, logoHeightRaw] = await Promise.all([
    getSetting(KEY_BRANDING_SHOW_LOGO),
    getSetting(KEY_BRANDING_TITLE),
    getSetting(KEY_BRANDING_TAGLINE),
    getSetting(KEY_BRANDING_LOGO_HEIGHT),
  ]);
  const parsedHeight = logoHeightRaw ? Number(logoHeightRaw) : NaN;
  const logoHeight = Number.isFinite(parsedHeight) ? clampLogoHeight(parsedHeight) : DEFAULT_LOGO_HEIGHT;
  return { showLogo: showLogo === '1', title, tagline, logoHeight };
}

function clampLogoHeight(value: number): number {
  return Math.min(MAX_LOGO_HEIGHT, Math.max(MIN_LOGO_HEIGHT, Math.round(value)));
}

export async function setFooterBranding(input: FooterBrandingSettings): Promise<void> {
  await setSetting(KEY_BRANDING_SHOW_LOGO, input.showLogo ? '1' : null);
  await setSetting(KEY_BRANDING_TITLE, input.title ? input.title.trim() : null);
  await setSetting(KEY_BRANDING_TAGLINE, input.tagline ? input.tagline.trim() : null);
  const height = Number.isFinite(input.logoHeight) ? clampLogoHeight(input.logoHeight) : DEFAULT_LOGO_HEIGHT;
  await setSetting(KEY_BRANDING_LOGO_HEIGHT, height === DEFAULT_LOGO_HEIGHT ? null : String(height));
}

export async function getFooterAdmin(): Promise<{
  columns: TreeNodeAdminWithChildren[];
  legalLinks: FooterLinkAdminRow[];
  legalText: string | null;
  branding: FooterBrandingSettings;
}> {
  const [columnRows, legalLinks, legalText, branding] = await Promise.all([
    listTreeAdmin('footer'),
    listFooterLegalLinksAdmin(),
    getFooterLegalText(),
    getFooterBranding(),
  ]);

  return {
    columns: buildAdminTree(columnRows),
    legalLinks,
    legalText,
    branding,
  };
}

// Viewer-scoped like resolveTreeForUser: unreadable pages drop out, urls go
// through safeTargetHref. The queries are here; assembleFooter shapes the rows.
export async function resolveFooterForUser(user: SessionUser | null): Promise<ResolvedFooter> {
  const [tree, legalLinkRows, legalText, branding, logo, readable] = await Promise.all([
    resolveTreeForUser('footer', user),
    db<(FooterLinkRow & { page_slug: string | null; namespace_slug: string | null })[]>`
      select n.id, n.position, n.label, n.target_type, n.target_page_id, n.url, n.created_at, n.updated_at,
             pn.slug as page_slug, ${db.unsafe(namespaceSlugColumn())}
      from footer_links n
      left join nodes pn on pn.id = n.target_page_id ${db.unsafe(namespaceJoin('pn'))}
      order by n.position`,
    getFooterLegalText(),
    getFooterBranding(),
    getCurrentLogo(),
    readablePageIds(user),
  ]);
  return assembleFooter({ tree, legalLinkRows, legalText, branding, logoId: logo?.id ?? null, readable });
}

/** The footer a viewer sees, from what resolveFooterForUser read. */
export function assembleFooter(input: {
  /** The footer's column tree, already resolved for the viewer. */
  tree: ResolvedTreeNode[];
  legalLinkRows: NavLinkRow[];
  legalText: string | null;
  branding: FooterBrandingSettings;
  /** The global logo's asset id, null when none is set. */
  logoId: string | null;
  readable: ReadonlySet<string>;
}): ResolvedFooter {
  const legalLinks: ResolvedFooterLink[] = [];
  for (const row of input.legalLinkRows) {
    const resolved = resolveNavLinkRow(row, input.readable);
    if (resolved) legalLinks.push(resolved);
  }

  const legalText = input.legalText && input.legalText.trim() ? input.legalText : null;

  // "Show logo" shows one only while a global logo exists to show.
  const { showLogo: wantsLogo, title, tagline, logoHeight } = input.branding;
  const showLogo = wantsLogo && input.logoId !== null;
  const branding: ResolvedFooterBranding | null =
    showLogo || title || tagline
      ? { showLogo, logoUrl: showLogo ? `/api/media/branding/logo/${input.logoId}` : null, title, tagline, logoHeight }
      : null;

  // The top level is groups-only by policy; the admin editor enforces it, this is the backstop.
  const columns = input.tree.filter((n): n is ResolvedTreeGroup => n.kind === 'group');

  return { columns, legalText, legalLinks, branding };
}
