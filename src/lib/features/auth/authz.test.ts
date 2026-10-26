// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { can } from './authz.server';
import { requireAction } from './routes/requireAction.server';
import type { SessionUser, Role, Action } from './types';

const user = (role: Role, id = role): SessionUser => ({ id, email: `${id}@t`, name: id, role });
const admin = user('admin');
const editor = user('editor');
const viewer = user('viewer');

// One per /settings section.
const MANAGE_ACTIONS = [
  'property:manage',
  'property-group:manage',
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
] as const satisfies readonly Action[];

const ALL_ACTIONS = [
  'page:read',
  'page:write',
  'property:read',
  'relationship:read',
  'search',
  'installation:view',
  ...MANAGE_ACTIONS,
] as const satisfies readonly Action[];

describe('can() — role capabilities', () => {
  it('admin can do everything', () => {
    for (const a of ALL_ACTIONS) expect(can(admin, a)).toBe(true);
  });

  it('editor: read/write pages, read properties/relationships, search — but manages nothing', () => {
    expect(can(editor, 'page:read')).toBe(true);
    expect(can(editor, 'page:write')).toBe(true);
    expect(can(editor, 'property:read')).toBe(true);
    expect(can(editor, 'relationship:read')).toBe(true);
    expect(can(editor, 'search')).toBe(true);
    for (const a of MANAGE_ACTIONS) expect(can(editor, a), a).toBe(false);
  });

  it('viewer: read + search only', () => {
    expect(can(viewer, 'page:read')).toBe(true);
    expect(can(viewer, 'search')).toBe(true);
    expect(can(viewer, 'page:write')).toBe(false);
    expect(can(viewer, 'property:read')).toBe(false);
    expect(can(viewer, 'relationship:read')).toBe(false);
    for (const a of MANAGE_ACTIONS) expect(can(viewer, a), a).toBe(false);
  });

  it('only an admin sees how the installation runs', () => {
    expect(can(admin, 'installation:view')).toBe(true);
    for (const u of [editor, viewer, null]) expect(can(u, 'installation:view')).toBe(false);
  });

  it('no user can do nothing', () => {
    for (const a of ALL_ACTIONS) expect(can(null, a)).toBe(false);
  });
});

describe('requireAction()', () => {
  it('admin passes every management action without throwing', () => {
    for (const a of MANAGE_ACTIONS) expect(() => requireAction(admin, a)).not.toThrow();
  });

  it('editor passes what the role holds and is rejected with 403 for a management action', () => {
    expect(() => requireAction(editor, 'page:write')).not.toThrow();
    expect(() => requireAction(editor, 'user:manage')).toThrow();
    expect(() => requireAction(editor, 'branding:manage')).toThrow();
  });

  it('viewer and anonymous are rejected for every management action', () => {
    for (const u of [viewer, null]) {
      for (const a of MANAGE_ACTIONS) expect(() => requireAction(u, a), a).toThrow();
    }
  });
});
