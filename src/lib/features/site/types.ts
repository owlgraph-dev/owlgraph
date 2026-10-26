// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Plain types, so the client components import these shapes without the server
// modules that produce them.

export type TreeConsumer = 'nav' | 'footer';
export type TreeNodeKind = 'group' | 'link';
export type TreeTargetType = 'page' | 'url';

export interface TreeNodeRow {
  id: string;
  consumer: TreeConsumer;
  parent_id: string | null;
  kind: TreeNodeKind;
  position: number;
  label: string;
  target_type: TreeTargetType | null;
  target_page_id: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreeNodeAdminRow extends TreeNodeRow {
  page_title: string | null;
  page_slug: string | null;
  namespace_slug: string | null;
}

export interface TreeNodeAdminWithChildren extends TreeNodeAdminRow {
  children: TreeNodeAdminRow[];
}

export interface TreeCreateInput {
  kind: TreeNodeKind;
  label: string;
  targetType?: TreeTargetType;
  targetPageId?: string | null;
  url?: string | null;
  parentId?: string | null;
}

export interface TreeUpdateInput {
  label: string;
  targetType?: TreeTargetType;
  targetPageId?: string | null;
  url?: string | null;
}

export interface ResolvedTreeLink {
  id: string;
  kind: 'link';
  label: string;
  href: string;
  external: boolean;
}

export interface ResolvedTreeGroup {
  id: string;
  kind: 'group';
  label: string;
  children: ResolvedTreeLink[];
}

export type ResolvedTreeNode = ResolvedTreeLink | ResolvedTreeGroup;

export type FooterTargetType = 'page' | 'url';

// A legal-line link: a row of footer_links.
export interface FooterLinkRow {
  id: string;
  position: number;
  label: string;
  target_type: FooterTargetType;
  target_page_id: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FooterLinkAdminRow extends FooterLinkRow {
  page_title: string | null;
  page_slug: string | null;
  namespace_slug: string | null;
}

export interface FooterLinkInput {
  label: string;
  targetType: FooterTargetType;
  targetPageId?: string | null;
  url?: string | null;
}

export interface FooterBrandingSettings {
  showLogo: boolean;
  title: string | null;
  tagline: string | null;
  logoHeight: number;
}

export interface ResolvedFooterLink {
  id: string;
  label: string;
  href: string;
  external: boolean;
}

export interface ResolvedFooterBranding {
  showLogo: boolean;
  logoUrl: string | null;
  title: string | null;
  tagline: string | null;
  logoHeight: number;
}

export interface ResolvedFooter {
  columns: ResolvedTreeGroup[];
  legalText: string | null;
  legalLinks: ResolvedFooterLink[];
  branding: ResolvedFooterBranding | null;
}

/** `inline` wraps a run of text, `block` a whole block. */
export type StyleKind = 'inline' | 'block';

export interface CustomStyleRow {
  id: string;
  /** Fixed at creation; the rendered class is `cs-<slug>`. */
  slug: string;
  label: string;
  kind: StyleKind;
  /** A declaration body, not a rule. */
  css: string;
  position: number;
}

export interface StylesheetWithStyles {
  id: string;
  name: string;
  position: number;
  enabled: boolean;
  freeCss: string;
  styles: CustomStyleRow[];
}
