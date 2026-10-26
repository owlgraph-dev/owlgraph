// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Uploading files, visibility, sharing and deletion stay with people, not agents.
import { z } from 'zod';
import type { ToolRegistry } from '../../../mcp/registry';
import { text, errText } from '../../../mcp/registry';
import { logEvent } from '$lib/platform/logger.server';
import { listDocumentsForUser, getDocumentText, createLinkDocument } from '$lib/features/documents/server';
import { parseExternalUrl, MAX_EXTERNAL_URL_LENGTH } from '$lib/features/documents';
import { getNodeProperties } from '$lib/features/semantic/server';
import { pluginLabel } from '$lib/plugins';

export function registerDocumentTools({ user, log, tool, documentTool }: ToolRegistry): void {
  tool(
    'list_documents',
    {
      title: 'List documents',
      description:
        "List documents you can access (id, title, sourceKind, plugin, mime, visibility), most recent first. sourceKind is 'upload' (a stored file: read it with get_document_text), 'link' (an external URL, no stored file) or 'plugin' (a file kept by another service through an integration — `plugin` names it — no stored file). Documents are separate from pages; read one with get_document or get_document_text, then create/update pages from it.",
      inputSchema: { limit: z.number().int().positive().max(50).optional() },
    },
    'page:read',
    async ({ limit }) => {
      const docs = await listDocumentsForUser(user);
      const out = docs
        .slice(0, limit ?? 50)
        .map((d) => ({ id: d.id, title: d.title, sourceKind: d.source, plugin: d.plugin, mime: d.mime, visibility: d.visibility, locale: d.locale }));
      return text(JSON.stringify(out, null, 2));
    }
  );

  documentTool(
    'get_document',
    {
      title: 'Get document',
      description:
        "Get a document's metadata: title, author, source, sourceKind, plugin, externalUrl, mime, size, visibility, created date, and locale (the language its content is in). `source` and `author` are its bibliographic documents: properties (publisher/journal, author), if set. `sourceKind` says where its content lives: 'upload' (a stored file — read it with get_document_text), 'link' (no stored file; `externalUrl` is the address it points to, which you cannot fetch through this server) or 'plugin' (a file another service keeps, reached through the integration `plugin` names — no stored file; mime and size are what it last reported). Cite any kind on a page with [[doc:<documentId>|link text]].",
      inputSchema: { documentId: z.string() },
    },
    async (doc) => {
      const props = await getNodeProperties(doc.id);
      const author = props.find((p) => p.name === 'documents:author')?.value ?? null;
      const source = props.find((p) => p.name === 'documents:source')?.value ?? null;
      return text(
        JSON.stringify(
          {
            id: doc.id,
            title: doc.title,
            author,
            source,
            sourceKind: doc.source,
            plugin: doc.plugin,
            externalUrl: doc.external_url,
            mime: doc.mime,
            size: doc.size,
            visibility: doc.visibility,
            created_at: doc.created_at,
            locale: doc.locale,
          },
          null,
          2
        )
      );
    }
  );

  documentTool(
    'get_document_text',
    {
      title: 'Get document text',
      description:
        "Extract and return an uploaded document's text content (PDF, .txt, .md). Read a source document with this, then create or update pages from it. To cite the document on a page, embed [[doc:<documentId>|link text]] in any block text — that becomes a link to the document and a knowledge-graph edge. NOTE: text comes from the embedded text layer; scanned/image-only PDFs may yield little or no text. A link document (sourceKind 'link') or one another service keeps (sourceKind 'plugin') has no stored text.",
      inputSchema: { documentId: z.string() },
    },
    async (doc) => {
      if (doc.source === 'link') {
        return text(`(Linked document — no stored text. Its content lives at ${doc.external_url}, which this server does not fetch.)`);
      }
      if (doc.source === 'plugin') {
        return text(`(A document kept by ${pluginLabel(doc.plugin ?? '')} — no stored text; its file lives with that service.)`);
      }
      const res = await getDocumentText(doc.id);
      if (!res) return errText('Document not found');
      if (!res.text.trim()) return text('(No extractable text — the document may be scanned/image-only or empty.)');
      return text(res.text);
    }
  );

  tool(
    'create_document_link',
    {
      title: 'Create link document',
      description:
        "Create a document that points to an external URL instead of a stored file — referenced literature, a DOI, a download page. It is a full document node (title, class, documents: properties, tags, relationships) whose read view links out to the URL. `url` must be http(s); a DOI (doi:10.… or 10.…/…) is rewritten to https://doi.org/…. The server never fetches the URL. Returns the new document's id and slug; cite it on a page with [[doc:<documentId>|link text]]. You cannot upload files.",
      inputSchema: {
        title: z.string().min(1).max(500),
        url: z.string().max(MAX_EXTERNAL_URL_LENGTH + 100),
        namespaceId: z.string().uuid().optional(),
        locale: z.string().optional().describe("The language the content is in — an enabled language code such as 'de' or 'en' (not the interface language); it decides how full-text search indexes the content. Default: the site default language."),
      },
    },
    'page:write',
    async ({ title, url, namespaceId, locale }) => {
      const parsed = parseExternalUrl(url);
      if (!parsed.ok) return errText(`Invalid url (${parsed.reason}): use an http(s) address or a DOI.`);
      if (!title.trim()) return errText('A title is required.');
      try {
        const { id, slug } = await createLinkDocument({ url: parsed.url, title, createdBy: user.id, user, namespaceId, locale });
        logEvent(log, 'node.created', { nodeId: id, nodeType: 'document', namespaceId: namespaceId ?? null, actorId: user.id, source: 'link' });
        return text(JSON.stringify({ id, slug, sourceKind: 'link', externalUrl: parsed.url }, null, 2));
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === 'namespace_membership_required') return errText(`Forbidden: ${err.message}`);
        if (err.code === 'locale_not_enabled') return errText(err.message);
        if (err.message === 'Unknown namespace') return errText('Unknown namespace');
        throw e;
      }
    }
  );
}
