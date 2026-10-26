// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The viewer identity every layer shares, the client and the pure access rules
// (nodes/access.ts) included, so it stays out of the server module.

export type Role = 'admin' | 'editor' | 'viewer';
export const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** The interface language the user chose, or null (docs/architecture/languages.md). Only an enabled language counts. */
  locale?: string | null;
}

// The role-tier actions. Declared here, not in authz.server.ts, because the
// client derives the settings navigation from them; the decision, can(), stays
// on the server.
export type Action =
  | 'page:read'
  | 'page:write'
  | 'property:read'
  | 'property:manage'
  | 'property-group:manage'
  | 'relationship:read'
  | 'relationship:manage'
  | 'class:manage'
  | 'namespace:manage'
  | 'navigation:manage'
  | 'homepage:manage'
  | 'footer:manage'
  | 'branding:manage'
  | 'font:manage'
  | 'stylesheet:manage'
  | 'page-layout:manage'
  | 'locale:manage'
  | 'integration:manage'
  | 'user:manage'
  // The admin half of /-/about: versions, schema, integrations.
  | 'installation:view'
  | 'search';
