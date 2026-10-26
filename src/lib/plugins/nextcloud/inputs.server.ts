// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugin's blocks as an agent authors them (docs/architecture/plugins.md, "What an agent
// may author"). Each node is read through the host as the agent, so it embeds
// only what it may read, and nothing while the plugin is off. The nodes are sparse.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { definePluginInputs, type PluginBlockInput, type PluginHost } from '$lib/plugins/api';
import { nextcloud } from './index';
import { checkSharePath } from './sharePath';
import { FOLDER_BLOCK, MAX_FOLDER_PAGE_SIZE } from './blocks/folder/model';
import { FILE_BLOCK } from './blocks/file/model';

const folderShape = z.object({
  kind: z.literal('nextcloud-folder'),
  collectionId: z.string().uuid().describe('A Nextcloud collection (get_collection names its plugin "nextcloud"; search finds it).'),
  startPath: z.string().optional().describe('The folder inside the collection it starts at, relative to its root ("Q3/Reports"); omit for the root.'),
  density: z.enum(['normal', 'compact']).optional(),
  sortKey: z.enum(['name', 'modified', 'size']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  showSize: z.boolean().optional(),
  showModified: z.boolean().optional(),
  allowNavigate: z.boolean().optional().describe('Whether a reader may open the subfolders. Default true.'),
  pageSize: z.number().int().min(1).max(MAX_FOLDER_PAGE_SIZE).optional().describe('Entries a page of the listing holds before "Load more". Default 50.'),
  highlightLinked: z.boolean().optional().describe('Whether a file that is a document of the collection says so. Default true.'),
});

const fileShape = z.object({
  kind: z.literal('nextcloud-file'),
  documentId: z.string().uuid().describe('A Nextcloud document (list_documents names its plugin "nextcloud"; search finds it).'),
  variant: z.enum(['row', 'card']).optional(),
  titleMode: z.enum(['auto', 'node', 'filename']).optional(),
  preview: z.enum(['auto', 'none']).optional(),
  showMeta: z.boolean().optional(),
  showDownload: z.boolean().optional(),
  showNodeLink: z.boolean().optional(),
});

/** Only the attrs the agent gave. */
function given(input: Record<string, unknown>, skip: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => !skip.includes(key) && value !== undefined));
}

async function enabled(host: PluginHost): Promise<void> {
  if (!(await host.settings()).enabled) throw new Error('the Nextcloud integration is turned off');
}

function folderNode(input: z.infer<typeof folderShape>) {
  const start = input.startPath === undefined ? { path: '' } : checkSharePath(input.startPath);
  if (!('path' in start)) throw new Error(`startPath "${input.startPath}" is no folder inside the collection`);
  return { type: FOLDER_BLOCK, attrs: { blockId: randomUUID(), collectionId: input.collectionId, ...given(input, ['kind', 'collectionId', 'startPath']), startPath: start.path } };
}

function fileNode(input: z.infer<typeof fileShape>) {
  return { type: FILE_BLOCK, attrs: { blockId: randomUUID(), documentId: input.documentId, ...given(input, ['kind', 'documentId']) } };
}

const folderInput: PluginBlockInput<typeof folderShape> = {
  block: FOLDER_BLOCK,
  shape: folderShape,
  node: folderNode,
  async build(input, host) {
    await enabled(host);
    const collection = await host.nodes.read(input.collectionId);
    if (!collection || collection.type !== 'collection') throw new Error(`Nextcloud collection ${input.collectionId} not found`);
    return folderNode(input);
  },
  describe: () =>
    "NEXTCLOUD: kind:'nextcloud-folder' {collectionId, startPath?, density?, sortKey?, sortDir?, showSize?, showModified?, allowNavigate?, pageSize?, highlightLinked?} shows a Nextcloud collection's folder, listed live — each reader reads it as they may, through its share or their own connected account.",
};

const fileInput: PluginBlockInput<typeof fileShape> = {
  block: FILE_BLOCK,
  shape: fileShape,
  node: fileNode,
  async build(input, host) {
    await enabled(host);
    const document = await host.nodes.read(input.documentId);
    if (!document || document.type !== 'document') throw new Error(`Nextcloud document ${input.documentId} not found`);
    return fileNode(input);
  },
  describe: () =>
    "kind:'nextcloud-file' {documentId, variant?: 'row'|'card', titleMode?: 'auto'|'node'|'filename', preview?: 'auto'|'none', showMeta?, showDownload?, showNodeLink?} shows one Nextcloud document — its file, opened and downloaded through a grant of each reader's own.",
};

export const nextcloudInputs = definePluginInputs(nextcloud, [folderInput, fileInput] as const);
