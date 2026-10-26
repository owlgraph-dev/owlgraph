// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import type { PluginNode } from '$lib/plugins/api';
import { fakeHost } from './e2e/fakeHost';
import { nextcloudInputs } from './inputs.server';

const [folderInput, fileInput] = nextcloudInputs;
const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';
const DOCUMENT = '2b4f0c1e-6d3a-4c59-9e1a-7f0b3c2d1e44';

const node = (id: string, type: PluginNode['type']): PluginNode => ({ id, type, title: 'T', href: '/t', ref: {}, file: null, content: null });
const host = (readable: PluginNode[], enabled = true) =>
  fakeHost({ origin: null, enabled, nodes: { read: async (id: string) => readable.find((n) => n.id === id) ?? null } });

describe('the Nextcloud blocks as an agent authors them', () => {
  it('are sparse nodes of the plugin’s kinds: what the agent leaves out stays the block’s default', () => {
    expect(folderInput.node(folderInput.shape.parse({ kind: 'nextcloud-folder', collectionId: COLLECTION }))).toEqual({
      type: 'nextcloudFolder',
      attrs: { blockId: expect.any(String), collectionId: COLLECTION, startPath: '' },
    });
    expect(fileInput.node(fileInput.shape.parse({ kind: 'nextcloud-file', documentId: DOCUMENT, variant: 'card' }))).toEqual({
      type: 'nextcloudFile',
      attrs: { blockId: expect.any(String), documentId: DOCUMENT, variant: 'card' },
    });
  });

  it('refuse a start folder outside the collection', () => {
    expect(() => folderInput.node(folderInput.shape.parse({ kind: 'nextcloud-folder', collectionId: COLLECTION, startPath: '../up' }))).toThrow('no folder inside the collection');
  });

  it("show only what the agent may read of the plugin's own, of the right kind", async () => {
    const folder = folderInput.shape.parse({ kind: 'nextcloud-folder', collectionId: COLLECTION });
    await expect(folderInput.build(folder, host([]))).rejects.toThrow(`Nextcloud collection ${COLLECTION} not found`);
    await expect(folderInput.build(folder, host([node(COLLECTION, 'document')]))).rejects.toThrow('not found');
    await expect(folderInput.build(folder, host([node(COLLECTION, 'collection')]))).resolves.toMatchObject({ type: 'nextcloudFolder' });
    const file = fileInput.shape.parse({ kind: 'nextcloud-file', documentId: DOCUMENT });
    await expect(fileInput.build(file, host([node(DOCUMENT, 'document')]))).resolves.toMatchObject({ type: 'nextcloudFile' });
  });

  it('refuse everything while the plugin is turned off', async () => {
    const file = fileInput.shape.parse({ kind: 'nextcloud-file', documentId: DOCUMENT });
    await expect(fileInput.build(file, host([node(DOCUMENT, 'document')], false))).rejects.toThrow('the Nextcloud integration is turned off');
  });
});
