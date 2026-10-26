// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Keep out of the MCP server's import graph: @sveltejs/kit is a devDependency,
// absent from the production image (`npm ci --omit=dev`).
import { createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';
import { can } from '../authz.server';
import { logEvent, logger, type Logger } from '$lib/platform/logger.server';
import type { SessionUser, Action } from '../types';
import type { NodeType } from '$lib/features/nodes';

// Call it in a section's `load` AND in every form action: actions run before a
// parent layout's `load` reruns, so a layout guard never protects a direct POST.
// Hiding a section from the sidebar is presentation; this is the protection.
export function requireAction(user: SessionUser | null | undefined, action: Action, log: Logger = logger): void {
  if (can(user, action)) return;
  // The same event as the API adapters and the MCP registry, so one query spans
  // every surface (docs/architecture/logging.md, "Authorization").
  logEvent(log, 'authz.denied', { action, resourceType: 'route', via: 'route' });
  throw error(403, 'Not allowed.');
}

/**
 * The API's counterpart to requireAction: logs the same `authz.denied` and
 * returns the 403, `forbidden` unless the refusal has a code of its own. A
 * helper, not a guard: API checks are per resource, so only the caller knows
 * which one was refused.
 */
export function apiForbidden(
  log: Logger,
  opts: {
    action: string;
    resourceType: NodeType | 'namespace' | 'route' | 'tool';
    resourceId?: string;
    code?: 'forbidden' | 'namespace_membership_required';
  }
): Response {
  logEvent(log, 'authz.denied', {
    action: opts.action,
    resourceType: opts.resourceType,
    resourceId: opts.resourceId,
    via: 'api',
  });
  return apiError(opts.code ?? 'forbidden');
}

/**
 * A settings page's `audit(locals, operation, extra?)`: `settingsChanged`
 * bound once to its section and the permission that guards it, so no action
 * can drift from either.
 */
export function settingsAudit(section: string, permission: string) {
  return (
    locals: App.Locals,
    operation: string,
    extra: { from?: string | number | boolean | null; to?: string | number | boolean | null; payload?: string } = {}
  ): void => settingsChanged(locals.log, locals.user, { section, permission, operation, ...extra });
}

/**
 * One settings mutation, logged after it succeeded, with the permission that
 * allowed it (docs/architecture/logging.md, "The audit subset"). `from`/`to` take only cheap,
 * non-sensitive scalars; a structured payload is logged as its `contentHash`.
 */
export function settingsChanged(
  log: Logger,
  actor: { id: string } | null | undefined,
  opts: {
    section: string;
    permission: string;
    operation: string;
    from?: string | number | boolean | null;
    to?: string | number | boolean | null;
    payload?: string;
  }
): void {
  logEvent(log, 'settings.changed', {
    section: opts.section,
    permission: opts.permission,
    operation: opts.operation,
    actorId: actor?.id ?? null,
    from: opts.from,
    to: opts.to,
    contentHash:
      opts.payload === undefined ? undefined : createHash('sha256').update(opts.payload).digest('hex').slice(0, 12),
  });
}
