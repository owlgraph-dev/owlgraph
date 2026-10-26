// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugin's server half (docs/architecture/plugins.md, "The server half"). It reaches the
// network only through the host's client, pinned to the configured server.
import { definePluginServer } from '$lib/plugins/api';
import { nextcloud } from './index';
import { checkServer } from './server/status.server';
import { listingRoute } from './server/listing.server';
import { fileRoute, openRoute, serveDocument } from './server/files.server';
import { connectCollection, createCollectionRoute, describeCollection, searchCollectionsRoute } from './server/collections.server';
import { checkDocumentRoute, createDocumentRoute, getDocumentRoute, rebindDocumentRoute, searchDocumentsRoute } from './server/documents.server';
import { resolveFolderBlocks } from './blocks/folder/blockData.server';
import { resolveFileBlocks } from './blocks/file/blockData.server';
import { searchText } from './server/search';
import { connectFlow } from './server/connect.server';
import { ownListingRoute } from './server/own.server';
import { collectionNodeView } from './server/nodeView.server';

export const nextcloudServer = definePluginServer(nextcloud, {
  id: 'nextcloud',
  routes: [
    // Readers' routes: the node's own access decides.
    { method: 'GET', path: 'listing', access: 'public', handle: listingRoute },
    { method: 'GET', path: 'open', access: 'public', handle: openRoute },
    { method: 'GET', path: 'file/:token', access: 'public', handle: fileRoute },
    // Editors' routes: the host checks the writer of each node.
    { method: 'POST', path: 'collections', access: 'signed-in', checksCredential: true, handle: createCollectionRoute },
    { method: 'GET', path: 'collections', access: 'signed-in', handle: searchCollectionsRoute },
    { method: 'POST', path: 'documents', access: 'signed-in', handle: createDocumentRoute },
    { method: 'GET', path: 'documents', access: 'signed-in', handle: searchDocumentsRoute },
    { method: 'GET', path: 'documents/:id', access: 'signed-in', handle: getDocumentRoute },
    { method: 'PATCH', path: 'documents/:id', access: 'signed-in', handle: rebindDocumentRoute },
    { method: 'POST', path: 'documents/:id/check', access: 'signed-in', handle: checkDocumentRoute },
    // Through the editor's own connection.
    { method: 'GET', path: 'own/listing', access: 'signed-in', handle: ownListingRoute },
  ],
  settings: {
    check: (upstream) => checkServer(upstream),
  },
  connections: connectFlow,
  blockData: {
    nextcloudFolder: resolveFolderBlocks,
    nextcloudFile: resolveFileBlocks,
  },
  nodeSource: {
    serveDocument,
    connectCollection,
    describeCollection,
    nodeView: collectionNodeView,
    searchText,
  },
});
