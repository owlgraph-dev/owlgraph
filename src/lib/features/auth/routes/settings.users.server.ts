// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/users, re-exported by src/routes/settings/users/+page.server.ts.
import { requireAction } from './requireAction.server';
import { logEvent } from '$lib/platform/logger.server';
import {
  listUsers,
  createUser,
  getUserByEmail,
  setUserRole,
  setUserActive,
  setUserPassword,
  ROLES,
  type Role,
} from '$lib/features/auth/server';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from '$lib/features/auth';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';
import { formError } from '$lib/platform/formError.server';

// The policy's refusal, worded in the request's language by the code table;
// passwordProblemMessage is create-admin's English.
const weakPassword = (password: string) => {
  const problem = passwordProblem(password);
  return problem ? formError('weak_password', { problem, min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH }) : null;
};

export const load = async ({ locals }: ServerLoadEvent) => {
  requireAction(locals.user, 'user:manage', locals.log);
  return { users: await listUsers(), meId: locals.user!.id };
};

export const actions = {
  create: async ({ request, locals }) => {
    requireAction(locals.user, 'user:manage', locals.log);
    const f = await request.formData();
    const email = String(f.get('email') ?? '').trim().toLowerCase();
    const name = String(f.get('name') ?? '').trim();
    const role = String(f.get('role') ?? 'viewer') as Role;
    const password = String(f.get('password') ?? '');
    if (!email || !password) return formError('credentials_required');
    if (!ROLES.includes(role)) return formError('invalid_role');
    const weak = weakPassword(password);
    if (weak) return weak;
    if (await getUserByEmail(email)) return formError('email_taken');
    const created = await createUser({ email, name, password, role });
    logEvent(locals.log, 'user.created', {
      subjectId: created.id,
      role: created.role,
      actorId: locals.user?.id ?? null,
    });
    return { ok: true };
  },

  // One action for the edit modal, which posts one form.
  update: async ({ request, locals }) => {
    requireAction(locals.user, 'user:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const role = String(f.get('role') ?? '') as Role;
    const password = String(f.get('password') ?? '');
    if (!ROLES.includes(role)) return formError('invalid_role');
    if (id === locals.user!.id && role !== 'admin') {
      return formError('own_admin_role');
    }
    if (password) {
      const weak = weakPassword(password);
      if (weak) return weak;
    }
    // from/to needs the previous value, and this action has no loaded row.
    const before = (await listUsers()).find((u) => u.id === id) ?? null;
    await setUserRole(id, role);
    if (before?.role !== role) {
      logEvent(locals.log, 'user.role_changed', {
        subjectId: id,
        from: before?.role ?? null,
        to: role,
        actorId: locals.user?.id ?? null,
      });
    }
    if (password) {
      await setUserPassword(id, password);
      // Nothing about the value, not even its length (docs/architecture/logging.md, "The audit subset").
      logEvent(locals.log, 'user.password_changed', {
        subjectId: id,
        actorId: locals.user?.id ?? null,
        self: id === locals.user?.id,
      });
    }
    return { ok: true };
  },

  setActive: async ({ request, locals }) => {
    requireAction(locals.user, 'user:manage', locals.log);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const active = String(f.get('active') ?? '') === 'true';
    if (id === locals.user!.id && !active) {
      return formError('own_deactivate');
    }
    const before = (await listUsers()).find((u) => u.id === id) ?? null;
    await setUserActive(id, active);
    logEvent(locals.log, 'user.activation_changed', {
      subjectId: id,
      from: before?.is_active ?? null,
      to: active,
      actorId: locals.user?.id ?? null,
    });
    return { ok: true };
  },
} satisfies Actions;
