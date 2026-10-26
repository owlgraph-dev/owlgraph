// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { canReadNode, canWriteNode } from './access';
import type { SessionUser, Role } from '$lib/features/auth/server';

const user = (role: Role, id = role): SessionUser => ({ id, email: `${id}@t`, name: id, role });
const admin = user('admin');
const editor = user('editor');
const viewer = user('viewer');

const page = (visibility: string, created_by: string | null) => ({ id: 'pg', visibility, created_by });

const inheriting = (accessLevel: string, created_by: string | null) => ({
  id: 'pg',
  visibility: null as string | null,
  created_by,
  namespace_access_level: accessLevel as 'public' | 'internal' | 'restricted',
});

describe('canReadNode()', () => {
  it('public: readable by anyone, including signed-out', () => {
    const p = page('public', 'someone');
    expect(canReadNode(null, p)).toBe(true);
    expect(canReadNode(viewer, p)).toBe(true);
    expect(canReadNode(editor, p)).toBe(true);
    expect(canReadNode(admin, p)).toBe(true);
  });

  it('internal: any signed-in user, but not anonymous', () => {
    const p = page('internal', 'someone');
    expect(canReadNode(null, p)).toBe(false);
    expect(canReadNode(viewer, p)).toBe(true);
    expect(canReadNode(editor, p)).toBe(true);
    expect(canReadNode(admin, p)).toBe(true);
  });

  describe('restricted', () => {
    it('admins bypass (read anything)', () => {
      expect(canReadNode(admin, page('restricted', 'someone-else'))).toBe(true);
    });
    it('owner can read their own restricted page', () => {
      expect(canReadNode(editor, page('restricted', editor.id))).toBe(true);
    });
    it('non-owner: only if explicitly shared', () => {
      const p = page('restricted', 'someone-else');
      expect(canReadNode(editor, p, false)).toBe(false);
      expect(canReadNode(editor, p, true)).toBe(true);
      expect(canReadNode(viewer, p, false)).toBe(false);
      expect(canReadNode(viewer, p, true)).toBe(true);
    });
    it('anonymous never reads restricted', () => {
      expect(canReadNode(null, page('restricted', 'x'), true)).toBe(false);
    });
  });

  // A forgotten `nodes` join leaves both undefined.
  it('fails closed for every non-admin role when visibility/created_by are unexpectedly undefined', () => {
    const broken = { id: 'pg', visibility: undefined as unknown as string, created_by: undefined as unknown as string | null };
    expect(canReadNode(null, broken)).toBe(false);
    expect(canReadNode(viewer, broken)).toBe(false);
    expect(canReadNode(editor, broken)).toBe(false);
    expect(canReadNode(admin, broken)).toBe(true);
  });

  describe('inherited namespace access (visibility: null)', () => {
    it('inherits public/internal exactly like an explicit value', () => {
      expect(canReadNode(null, inheriting('public', 'someone'))).toBe(true);
      expect(canReadNode(null, inheriting('internal', 'someone'))).toBe(false);
      expect(canReadNode(viewer, inheriting('internal', 'someone'))).toBe(true);
    });

    it('restricted + inheriting: namespace membership grants read, not the (irrelevant) share flag', () => {
      const p = inheriting('restricted', 'someone-else');
      expect(canReadNode(editor, p, /* isShared */ true, /* isNamespaceMember */ false)).toBe(false);
      expect(canReadNode(editor, p, /* isShared */ false, /* isNamespaceMember */ true)).toBe(true);
    });

    it('restricted + inheriting: owner and admin always read regardless of membership', () => {
      expect(canReadNode(editor, inheriting('restricted', editor.id), false, false)).toBe(true);
      expect(canReadNode(admin, inheriting('restricted', 'someone-else'), false, false)).toBe(true);
    });

    it('restricted + EXPLICIT override: per-node shares apply, membership is irrelevant', () => {
      const p = page('restricted', 'someone-else');
      expect(canReadNode(editor, p, /* isShared */ false, /* isNamespaceMember */ true)).toBe(false);
      expect(canReadNode(editor, p, /* isShared */ true, /* isNamespaceMember */ false)).toBe(true);
    });

    it('anonymous never reads an inherited-restricted node, even as a "member" flag misfire', () => {
      expect(canReadNode(null, inheriting('restricted', 'x'), false, true)).toBe(false);
    });
  });
});

describe('canWriteNode() on a page', () => {
  it('viewers and anonymous never write', () => {
    expect(canWriteNode(viewer, page('internal', null), 'page')).toBe(false);
    expect(canWriteNode(null, page('public', null), 'page')).toBe(false);
  });

  it('admin writes anything, including others’ restricted pages', () => {
    expect(canWriteNode(admin, page('restricted', 'someone-else'), 'page')).toBe(true);
  });

  it('editor writes public/internal pages', () => {
    expect(canWriteNode(editor, page('public', 'someone'), 'page')).toBe(true);
    expect(canWriteNode(editor, page('internal', 'someone'), 'page')).toBe(true);
  });

  it('editor writes a restricted page without being shared/a member ONLY if they own it', () => {
    expect(canWriteNode(editor, page('restricted', editor.id), 'page')).toBe(true);
    expect(canWriteNode(editor, page('restricted', 'someone-else'), 'page')).toBe(false);
  });

  // Write resolves the effective visibility, as read does, not the raw column.
  it('owner of an inherited-restricted page can still write it', () => {
    expect(canWriteNode(editor, inheriting('restricted', editor.id), 'page')).toBe(true);
  });

  describe('restricted access subjects grant read AND write (symmetric trust)', () => {
    it('a namespace member (non-owner) can write an inherited-restricted page', () => {
      const p = inheriting('restricted', 'someone-else');
      expect(canReadNode(editor, p, false, /* isNamespaceMember */ true)).toBe(true);
      expect(canWriteNode(editor, p, 'page', false, /* isNamespaceMember */ true)).toBe(true);
    });

    it('a non-member (non-owner) editor cannot write an inherited-restricted page', () => {
      const p = inheriting('restricted', 'someone-else');
      expect(canWriteNode(editor, p, 'page', false, /* isNamespaceMember */ false)).toBe(false);
    });

    it('a user on an explicitly-overridden page\'s share list (non-owner) can write it', () => {
      const p = page('restricted', 'someone-else');
      expect(canReadNode(editor, p, /* isShared */ true, false)).toBe(true);
      expect(canWriteNode(editor, p, 'page', /* isShared */ true, false)).toBe(true);
    });

    it('a non-shared (non-owner) editor cannot write an explicitly-overridden restricted page', () => {
      const p = page('restricted', 'someone-else');
      expect(canWriteNode(editor, p, 'page', /* isShared */ false, false)).toBe(false);
    });

    it('the two subjects do not cross-apply: a namespace member is not automatically on a different page\'s explicit share list, and vice versa', () => {
      const inheritedPage = inheriting('restricted', 'someone-else');
      const overriddenPage = page('restricted', 'someone-else');
      expect(canWriteNode(editor, overriddenPage, 'page', false, /* isNamespaceMember */ true)).toBe(false);
      expect(canWriteNode(editor, inheritedPage, 'page', /* isShared */ true, false)).toBe(false);
    });

    it('viewers never write, even as a member or on the share list', () => {
      expect(canWriteNode(viewer, inheriting('restricted', 'someone-else'), 'page', false, true)).toBe(false);
      expect(canWriteNode(viewer, page('restricted', 'someone-else'), 'page', true, false)).toBe(false);
    });
  });
});

describe('canWriteNode() per node type', () => {
  it('writes a collection like a page, a document only as its owner', () => {
    const collection = page('internal', 'someone');
    expect(canWriteNode(editor, collection, 'collection')).toBe(true);
    expect(canWriteNode(viewer, collection, 'collection')).toBe(false);
    expect(canWriteNode(null, collection, 'collection')).toBe(false);
    expect(canWriteNode(editor, page('internal', 'someone'), 'document')).toBe(false);
    expect(canWriteNode(editor, page('internal', 'editor'), 'document')).toBe(true);
  });

  it('never lets a viewer write, not even a document they uploaded before their role was lowered', () => {
    expect(canWriteNode(viewer, page('internal', 'viewer'), 'document')).toBe(false);
    expect(canWriteNode(viewer, page('restricted', 'viewer'), 'document')).toBe(false);
    expect(canWriteNode(viewer, page('restricted', 'viewer'), 'collection')).toBe(false);
    expect(canWriteNode(viewer, page('restricted', 'viewer'), 'page')).toBe(false);
  });

  it('writes a restricted collection only as its owner, a namespace member while it inherits, or an admin', () => {
    expect(canWriteNode(editor, page('restricted', 'someone'), 'collection')).toBe(false);
    expect(canWriteNode(editor, page('restricted', 'editor'), 'collection')).toBe(true);
    expect(canWriteNode(editor, inheriting('restricted', 'someone'), 'collection', false, true)).toBe(true);
    expect(canWriteNode(admin, page('restricted', 'someone'), 'collection')).toBe(true);
  });
});
