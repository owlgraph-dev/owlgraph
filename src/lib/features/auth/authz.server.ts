// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Authorization, the role check: which actions a role may perform at all. The
// resource tier, a node's effective visibility, lives in features/nodes/access.ts.
import type { Role, SessionUser, Action } from './types';

export type { Action };

// Every /settings section is gated by its own `<resource>:manage` action, so a
// role is nothing but a bundle of actions.
const ROLE_ACTIONS: Record<Role, Action[]> = {
  admin: [
    'page:read',
    'page:write',
    'property:read',
    'property:manage',
    'property-group:manage',
    'relationship:read',
    'relationship:manage',
    'class:manage',
    'namespace:manage',
    'navigation:manage',
    'homepage:manage',
    'footer:manage',
    'branding:manage',
    'font:manage',
    'stylesheet:manage',
    'page-layout:manage',
    'locale:manage',
    'integration:manage',
    'user:manage',
    'installation:view',
    'search',
  ],
  editor: ['page:read', 'page:write', 'property:read', 'relationship:read', 'search'],
  viewer: ['page:read', 'search'],
};

export function can(user: SessionUser | null | undefined, action: Action, _resource?: unknown): boolean {
  if (!user) return false;
  // `_resource` is unused: resource-scoped checks live in features/nodes/access.ts.
  return ROLE_ACTIONS[user.role]?.includes(action) ?? false;
}
