// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one logger (docs/architecture/logging.md), shared by the app and the MCP server: one
// schema, one catalogue, one redaction list.
//
// Free of `$app/*` and @sveltejs/kit, which the MCP process must never import
// (scripts/check-boundaries.mjs): the environment comes from process.env.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';
import type { NodeType, Visibility } from '$lib/features/nodes';
import type { DocumentSource } from '$lib/features/documents';

export type { Logger };

const isProd = process.env.NODE_ENV === 'production';

/**
 * Which process a line came from. pino's `mixin` reads it per call, so setting
 * it at startup holds whatever the import order.
 */
let procLabel: 'app' | 'mcp' | 'migrate' = 'app';
export function markProcess(proc: 'app' | 'mcp' | 'migrate'): void {
  procLabel = proc;
}

// Redaction is a backstop, not the control: call sites bind `userId`, never a
// user object (SessionUser carries `email` and `name`). `tokenHash` is absent:
// it is already truncated.
const REDACT = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'password_hash',
  'token',
  'rawToken',
  'sessionToken',
  'apiToken',
  'email',
  'name',
  'doc',
  'html',
  'css',
  'bytes',
  'sample',
  // An integration's credentials, sealed values and login handshake.
  'secret',
  'sealed',
  'shareToken',
  'sharePassword',
  'appPassword',
  'loginName',
  'pollToken',
  'credential',
  'handle',
  'approveUrl',
];
const REDACT_PATHS = [
  ...REDACT,
  ...REDACT.map((k) => `*.${k}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

// Exported for the unit test that reads what would be written.
export const loggerOptions: pino.LoggerOptions = {
  // `||`, not `??`: compose sets an unset LOG_LEVEL to an empty string, which
  // pino rejects at startup.
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  messageKey: 'event',
  // The documented `ts` field, ISO-8601 (pino's default is `time`, epoch millis).
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  // No pid/hostname: `proc` and the container's log label say more.
  base: null,
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  mixin: () => ({ proc: procLabel }),
};

/**
 * Pretty in dev, JSON in production. pino throws when it spawns the transport
 * worker, so the guard wraps pino() itself: a local `node build` without
 * pino-pretty falls back to JSON rather than crash at import.
 */
function createLogger(): Logger {
  // The transport is a worker thread; the silent unit tests would start one per file.
  if (isProd || loggerOptions.level === 'silent') return pino(loggerOptions);
  try {
    return pino({
      ...loggerOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,proc', messageKey: 'event' },
      },
    });
  } catch {
    return pino(loggerOptions);
  }
}

export const logger: Logger = createLogger();

/** Short ids, such as an error ID a user reads back over the phone. */
export function newId(): string {
  return randomBytes(6).toString('hex');
}

/**
 * This build's version, for `app.start`. Read from the working directory, not
 * relative to this module: the app ships bundled under build/.
 */
let cachedVersion: string | null = null;
export function appVersion(): string {
  if (cachedVersion === null) {
    try {
      cachedVersion = String(JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version ?? 'unknown');
    } catch {
      cachedVersion = 'unknown';
    }
  }
  return cachedVersion;
}

// Every event's name, level and audit flag. There is no free-form logging:
// `logEvent` takes only a name from here (docs/architecture/logging.md, "The catalogue").

type Level = 'error' | 'warn' | 'info' | 'debug';

interface CatalogEntry {
  level: Level;
  /** Marks the audit subset (docs/architecture/logging.md, "The audit subset"). */
  audit?: true;
}

export const CATALOG = {
  'app.start': { level: 'info' },
  'app.stop': { level: 'info' },
  'migrate.run': { level: 'info' },
  'http.request': { level: 'info' },
  'auth.login_ok': { level: 'info' },
  'auth.login_failed': { level: 'warn' },
  'auth.logout': { level: 'info' },
  'auth.session_invalidated': { level: 'info' },
  'auth.api_token_used': { level: 'info' },
  'auth.rate_limited': { level: 'warn' },
  'authz.denied': { level: 'warn' },
  'share.resolved': { level: 'info' },
  'share.not_found': { level: 'warn' },
  'share.created': { level: 'info', audit: true },
  'share.revoked': { level: 'info', audit: true },
  'sanitizer.rejected': { level: 'warn' },
  'upload.rejected': { level: 'warn' },
  'csp.violation': { level: 'warn' },
  'csp.report_unreadable': { level: 'warn' },
  'document.extract_failed': { level: 'warn' },
  'media.variant_failed': { level: 'warn' },
  'db.notice': { level: 'warn' },
  'page.unknown_drop_refused': { level: 'warn' },
  'integration.upstream_failed': { level: 'warn' },
  'integration.source_state': { level: 'info' },
  'integration.connection_state': { level: 'info' },
  'integration.connection_created': { level: 'info', audit: true },
  'integration.connection_removed': { level: 'info', audit: true },
  'integration.connections_cleared': { level: 'info', audit: true },
  'node.created': { level: 'info', audit: true },
  'node.deleted': { level: 'info', audit: true },
  'node.visibility_changed': { level: 'info', audit: true },
  'node.shares_changed': { level: 'info', audit: true },
  'document.source_changed': { level: 'info', audit: true },
  'namespace.access_changed': { level: 'info', audit: true },
  'namespace.membership_changed': { level: 'info', audit: true },
  'user.created': { level: 'info', audit: true },
  'user.role_changed': { level: 'info', audit: true },
  'user.activation_changed': { level: 'info', audit: true },
  'user.password_changed': { level: 'info', audit: true },
  'settings.changed': { level: 'info', audit: true },
  'error.unhandled': { level: 'error' },
  'error.expected': { level: 'warn' },
  'mcp.tool_call': { level: 'info' },
  'perf.slow_request': { level: 'warn' },
  'perf.slow_query': { level: 'warn' },
  'query.limit_hit': { level: 'warn' },
} satisfies Record<string, CatalogEntry>;

export type EventName = keyof typeof CATALOG;

/**
 * Each event's fields beyond the bound base ones (ts, level, event, proc,
 * reqId, userId, routeId). The audit events' shapes are a contract.
 */
export interface EventFields {
  'app.start': { version: string; nodeEnv: string; config: Record<string, string>; migrations?: string };
  'app.stop': { signal: string; uptimeMs: number };
  'migrate.run': { applied: string[]; adopted?: { baseline: string; replaced: number }; outcome: 'ok' | 'failed'; durationMs?: number; note?: string };

  'http.request': { method: string; status: number; durationMs: number };

  'auth.login_ok': Record<string, never>;
  'auth.login_failed': { failureClass: 'no_such_user' | 'inactive' | 'bad_password' };
  'auth.logout': Record<string, never>;
  'auth.session_invalidated': { reason: 'expired' | 'deactivated'; subjectId?: string };
  'auth.api_token_used': { tokenId: string };
  'auth.rate_limited': { limiter: string; retryAfterMs: number };

  'authz.denied': {
    action: string;
    resourceType: NodeType | 'namespace' | 'route' | 'tool';
    resourceId?: string;
    via: 'route' | 'api' | 'mcp';
  };

  'share.resolved': { tokenHash: string; nodeId: string };
  'share.not_found': { tokenHash: string };
  'share.created': { shareLinkId: string; tokenHash: string; nodeId: string; actorId: string | null };
  'share.revoked': { shareLinkId: string; nodeId: string; actorId: string | null };
  'sanitizer.rejected': { kind: 'html-block' | 'svg' | 'custom-css'; reason: string; issueCount?: number };
  'upload.rejected': {
    kind: 'image' | 'document' | 'logo' | 'font' | 'avatar';
    reason: 'type' | 'size' | 'content' | 'missing';
    bytes?: number;
  };
  'csp.violation': { directive: string; blocked: string; source: string; document: string; referrer: string };
  /** Never the body's content: the endpoint takes unauthenticated input. */
  'csp.report_unreadable': { reason: 'invalid-json' | 'not-a-report'; bytes: number };
  'document.extract_failed': { documentId?: string; errorClass: string };
  /** An image's copy (docs/architecture/media.md) couldn't be made; the image itself was served. */
  'media.variant_failed': { assetId: string; width: number; errorClass: string };
  'db.notice': { routine?: string; severity?: string; code?: string };
  /**
   * A page write refused for dropping unknown blocks the writer didn't name
   * (docs/architecture/blocks/anatomy.md, "Unknown blocks"): by kind and count, never content.
   */
  'page.unknown_drop_refused': { pageId: string; via: 'save' | 'apply-picks' | 'mcp'; count: number; types: string[] };
  /** Named by `operation`, never by URL: a path to the service can carry a credential. */
  'integration.upstream_failed': { plugin: string; operation: string; failure: string; status?: number; durationMs: number };
  /** By node id, never by the source's address. */
  'integration.source_state': { plugin: string; nodeId: string; from: string | null; to: string; reason?: string };
  /** By connection id; never the account, never the credential. */
  'integration.connection_state': { plugin: string; connectionId: string; subjectId: string; from: string; to: string };
  'integration.connection_created': { plugin: string; connectionId: string; subjectId: string; actorId: string; replaced: boolean };
  /** `remoteRevoked`: the service forgot the credential too. */
  'integration.connection_removed': {
    plugin: string;
    connectionId: string;
    subjectId: string;
    actorId: string | null;
    reason: 'disconnect' | 'admin' | 'origin_changed' | 'replaced';
    remoteRevoked: boolean;
  };
  'integration.connections_cleared': { plugin: string; count: number; actorId: string };

  /** `source` is set for a document only. */
  'node.created': {
    nodeId: string;
    nodeType: NodeType;
    namespaceId: string | null;
    actorId: string | null;
    source?: DocumentSource;
  };
  /** Never the URL: it is content. */
  'document.source_changed': { nodeId: string; from: DocumentSource; to: DocumentSource; actorId: string | null };
  'node.deleted': { nodeId: string; nodeType: NodeType; actorId: string | null };
  /** `null` on either side is "inherits its namespace's access level". */
  'node.visibility_changed': {
    nodeId: string;
    nodeType: NodeType;
    from: Visibility | null;
    to: Visibility | null;
    actorId: string | null;
  };
  /** Narrowing grants to named users, not the widening share links (share.created/revoked). */
  'node.shares_changed': {
    nodeId: string;
    nodeType: NodeType;
    granteeIds: string[];
    addedIds: string[];
    removedIds: string[];
    actorId: string | null;
  };
  'namespace.access_changed': { namespaceId: string; from: Visibility | null; to: Visibility; actorId: string | null };
  'namespace.membership_changed': {
    namespaceId: string;
    addedIds: string[];
    removedIds: string[];
    actorId: string | null;
  };
  'user.created': { subjectId: string; role: string; actorId: string | null };
  'user.role_changed': { subjectId: string; from: string | null; to: string; actorId: string | null };
  'user.activation_changed': { subjectId: string; from: boolean | null; to: boolean; actorId: string | null };
  /** Never anything about the value. */
  'user.password_changed': { subjectId: string; actorId: string | null; self: boolean };
  'settings.changed': {
    section: string;
    permission: string;
    actorId: string | null;
    operation: string;
    from?: string | number | boolean | null;
    to?: string | number | boolean | null;
    contentHash?: string;
  };

  'error.unhandled': { errorClass: string; message: string; stack?: string };
  'error.expected': { status: number; errorClass: string };

  'mcp.tool_call': { tool: string; toolCallId: string; durationMs: number; denied: boolean; denyReason?: string };

  'perf.slow_request': { method: string; status: number; durationMs: number };
  'perf.slow_query': { queryName: string; durationMs: number };
  'query.limit_hit': { limit: string; value: number; cap: number; via: 'page' | 'graphql' | 'mcp' };
}

/**
 * Emit a catalogue event at the catalogue's level. `opts.level` overrides it only
 * where the catalogue says the level varies (error.expected, a denied mcp.tool_call).
 */
export function logEvent<N extends EventName>(
  log: Logger,
  event: N,
  fields: EventFields[N],
  opts: { level?: Level } = {}
): void {
  const entry: CatalogEntry = CATALOG[event];
  const level = opts.level ?? entry.level;
  const payload: Record<string, unknown> = { ...fields };
  if (entry.audit) payload.audit = true;
  log[level](payload, event);
}

/** A logger bound to one request. */
export function requestLogger(reqId: string, routeId: string | null, userId: string | null): Logger {
  return logger.child({ reqId, routeId: routeId ?? '(none)', userId: userId ?? 'anon' });
}

/** Well under QUERY_BLOCK_TIMEOUT_MS (3000). */
export const SLOW_QUERY_MS = 200;
/** About where a human starts noticing. */
export const SLOW_REQUEST_MS = 1000;

/**
 * Times a call, not the database handle (docs/architecture/logging.md, "Performance and
 * limits"). Not postgres.js's `debug`: it fires at send time and sees the bound
 * parameters. `queryName` is a stable label, never SQL text or parameters.
 */
export async function timed<T>(queryName: string, fn: () => Promise<T>, log: Logger = logger): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    const durationMs = Math.round(performance.now() - started);
    if (durationMs >= SLOW_QUERY_MS) logEvent(log, 'perf.slow_query', { queryName, durationMs });
  }
}

/** The class name an error reports as, for `errorClass` fields. */
export function errorClass(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error';
  return typeof err;
}
