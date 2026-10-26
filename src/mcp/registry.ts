// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The host contract a feature's MCP adapter registers its tools against. Each
// helper wraps registerTool in the gate the tool needs, the same can() and
// userCanRead*/userCanWrite* calls the app makes (docs/architecture/authorization.md), so a
// tool never authorizes for itself.
import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { can, type Action } from '../lib/features/auth/server';
import type { SessionUser } from '../lib/features/auth/server';
import { getPage, userCanReadPage, userCanWritePage, type PageRow } from '../lib/features/pages/server';
import { getDocument, userCanReadDocument, type DocumentRow } from '../lib/features/documents/server';
import { logEvent, logger, newId, type Logger } from '../lib/platform/logger.server';
import type { NodeType } from '$lib/features/nodes';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
export const errText = (t: string): ToolResult => ({ ...text(t), isError: true });

// inputSchema is required: every tool declares its arguments ({} if none).
export interface ToolDef<S extends z.ZodRawShape> {
  title?: string;
  description?: string;
  inputSchema: S;
}

// Exact: the SDK validates the request against inputSchema first.
export type ToolArgs<S extends z.ZodRawShape> = z.infer<z.ZodObject<S>>;

type Handler<S extends z.ZodRawShape> = (args: ToolArgs<S>) => ToolResult | Promise<ToolResult>;

// Our own signature, not Parameters<typeof server.registerTool>: that reads
// only the last overload, which an SDK reshuffle turns into `never`. The SDK
// version is pinned in package.json to keep this shape true.
type RegisterTool = (
  name: string,
  def: ToolDef<z.ZodRawShape>,
  cb: (args: unknown, extra: unknown) => unknown
) => unknown;

export interface ToolRegistry {
  readonly user: SessionUser;
  /** For an operation's audit event; tool calls and denials are logged by the wrappers. */
  readonly log: Logger;
  /** Gated by role only. */
  tool<S extends z.ZodRawShape>(name: string, def: ToolDef<S>, action: Action, handler: Handler<S>): void;
  /** Loads args.pageId and checks the viewer's access to it before the handler runs. */
  pageTool<S extends z.ZodRawShape & { pageId: z.ZodString }>(
    name: string,
    def: ToolDef<S>,
    mode: 'read' | 'write',
    handler: (page: PageRow, args: ToolArgs<S>) => ToolResult | Promise<ToolResult>
  ): void;
  /**
   * Loads args.documentId and checks the viewer may read it. Agents read
   * documents; uploading, visibility, sharing and deletion stay with people.
   */
  documentTool<S extends z.ZodRawShape & { documentId: z.ZodString }>(
    name: string,
    def: ToolDef<S>,
    handler: (doc: DocumentRow, args: ToolArgs<S>) => ToolResult | Promise<ToolResult>
  ): void;
}

export function createToolRegistry(server: McpServer, user: SessionUser, log: Logger = logger): ToolRegistry {
  const register = server.registerTool.bind(server) as unknown as RegisterTool;

  /**
   * Every tool call and denial is logged here (docs/architecture/logging.md, "MCP"). A
   * denial is logged twice: `authz.denied` as on every surface, and in the
   * per-call `mcp.tool_call`, which must not omit the calls worth auditing.
   */
  const gated = <A extends unknown[]>(
    name: string,
    run: (...args: A) => Promise<ToolResult | { denied: string; result: ToolResult }>
  ) => {
    return async (...args: A): Promise<ToolResult> => {
      const toolCallId = newId();
      const started = performance.now();
      const callLog = log.child({ toolCallId, tool: name });
      let denyReason: string | undefined;
      try {
        const outcome = await run(...args);
        if (outcome && typeof outcome === 'object' && 'denied' in outcome) {
          denyReason = outcome.denied;
          return outcome.result;
        }
        return outcome as ToolResult;
      } finally {
        const denied = denyReason !== undefined;
        logEvent(
          callLog,
          'mcp.tool_call',
          { tool: name, toolCallId, durationMs: Math.round(performance.now() - started), denied, denyReason },
          { level: denied ? 'warn' : 'info' }
        );
      }
    };
  };

  const deny = (reason: string, resourceType: NodeType | 'tool', action: string, resourceId?: string, message?: string) => {
    logEvent(log, 'authz.denied', { action, resourceType, resourceId, via: 'mcp' });
    return { denied: reason, result: errText(message ?? reason) };
  };

  return {
    user,
    log,

    tool(name, def, action, handler) {
      register(name, def, gated(name, async (args: unknown) => {
        if (!can(user, action)) {
          return deny('role', 'tool', action, name, `Forbidden: your role "${user.role}" is not permitted to ${action}.`);
        }
        return handler(args as ToolArgs<typeof def.inputSchema>);
      }));
    },

    pageTool(name, def, mode, handler) {
      const action = mode === 'write' ? 'page:write' : 'page:read';
      register(name, def, gated(name, async (raw: unknown) => {
        const args = raw as ToolArgs<typeof def.inputSchema>;
        if (!can(user, action)) {
          return deny('role', 'tool', action, name, `Forbidden: your role "${user.role}" cannot ${mode} pages.`);
        }
        // Validated by the SDK; TS can't see through the generic inference.
        const pageId = (raw as { pageId: string }).pageId;
        const page = await getPage(pageId);
        if (!page) return errText('Page not found');
        // An unreadable page answers as a missing one, so a token never learns
        // which ids are taken (docs/architecture/mcp.md). The denial is still logged.
        if (!(await userCanReadPage(user, page))) return deny('visibility', 'page', action, pageId, 'Page not found');
        if (mode === 'write' && !(await userCanWritePage(user, page))) {
          return deny('visibility', 'page', action, pageId, "Forbidden: you don't have write access to this page.");
        }
        return handler(page, args);
      }));
    },

    documentTool(name, def, handler) {
      register(name, def, gated(name, async (raw: unknown) => {
        const args = raw as ToolArgs<typeof def.inputSchema>;
        if (!can(user, 'page:read')) {
          return deny('role', 'tool', 'page:read', name, `Forbidden: your role "${user.role}" cannot read content.`);
        }
        const documentId = (raw as { documentId: string }).documentId;
        const doc = await getDocument(documentId);
        if (!doc) return errText('Document not found');
        // Unreadable answers as missing, as for pages.
        if (!(await userCanReadDocument(user, doc))) return deny('visibility', 'document', 'page:read', documentId, 'Document not found');
        return handler(doc, args);
      }));
    },
  };
}
