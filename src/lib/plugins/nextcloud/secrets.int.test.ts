// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { logger } from '$lib/platform/logger.server';
import { createPluginHost, savePluginSettings } from '$lib/features/pluginHost/server';
import { pluginManifest } from '$lib/plugins';
import { userOf } from '$tests/integration/users';
import { decodeSecret, encodeSecret } from './server/client.server';

// A share's credential at rest (docs/architecture/authorization.md, "Credentials at rest"):
// sealed by the host for its node and opened only as that node's. Nothing here
// asks Nextcloud.

const ORIGIN = 'https://cloud.example';
const TOKEN = 'AtRestShareToken7';
const PASSWORD = 'geheim-at-rest';

beforeAll(async () => {
  // Turned on at an address, so the host seals for it.
  await savePluginSettings(pluginManifest('nextcloud')!, { enabled: true, values: { origin: ORIGIN, cacheSeconds: 60 } });
});

async function adminHost() {
  return createPluginHost('nextcloud', { user: await userOf('admin'), locale: 'en', log: logger });
}

/** Beside the seeded public page. */
async function shareCollection(name: string, token: string, password: string | null) {
  const made = await (await adminHost()).nodes.createCollection({
    title: name,
    besidePageId: inject('seed').publicId,
    ref: { path: '', name, status: 'ok' },
    secret: encodeSecret({ token, password }),
  });
  if (!made.ok) throw new Error(`the collection was not made: ${made.reason}`);
  return made.node.id;
}

describe("a share's credential at rest", () => {
  it('is stored sealed: neither the stored row nor the node’s records hold its token or password in clear — and it opens for its node', async () => {
    const id = await shareCollection('Intern', TOKEN, PASSWORD);
    const rows = await db<{ plugin: string; sealed: string }[]>`select plugin, sealed from node_source_secrets where node_id = ${id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].plugin).toBe('nextcloud');
    const records = [
      JSON.stringify(rows),
      JSON.stringify(await db`select * from nodes where id = ${id}`),
      JSON.stringify(await db`select * from collections where id = ${id}`),
    ];
    for (const record of records) {
      for (const secret of [TOKEN, PASSWORD, Buffer.from(TOKEN).toString('base64'), Buffer.from(PASSWORD).toString('base64')]) expect(record).not.toContain(secret);
    }
    expect(decodeSecret(await (await adminHost()).secrets.get(id))).toEqual({ token: TOKEN, password: PASSWORD });
  });

  it('moved to another node, opens as nothing there', async () => {
    const from = await shareCollection('Locked share', TOKEN, PASSWORD);
    const to = await shareCollection('Open share', 'AnotherShare8', null);
    expect(decodeSecret(await (await adminHost()).secrets.get(to))).toEqual({ token: 'AnotherShare8', password: null });
    await db`update node_source_secrets set sealed = (select sealed from node_source_secrets where node_id = ${from}) where node_id = ${to}`;
    expect(await (await adminHost()).secrets.get(to)).toBeNull();
    expect(decodeSecret(await (await adminHost()).secrets.get(from))).toEqual({ token: TOKEN, password: PASSWORD });
  });

  it("is a document's made from its collection, sealed anew for the document", async () => {
    const collection = await shareCollection('Vertraege', TOKEN, PASSWORD);
    const made = await (await adminHost()).nodes.createDocument({
      collectionId: collection,
      title: 'Vertrag',
      file: { filename: 'Vertrag.pdf', mime: 'application/pdf', size: 10 },
      ref: { path: 'Vertrag.pdf', fileid: '201', status: 'ok' },
      match: { fileid: '201' },
    });
    if (!made.ok) throw new Error(`the document was not made: ${made.reason}`);
    expect(decodeSecret(await (await adminHost()).secrets.get(made.node.id))).toEqual({ token: TOKEN, password: PASSWORD });
    const sealed = await db<{ node_id: string; sealed: string }[]>`select node_id, sealed from node_source_secrets where node_id in (${collection}, ${made.node.id})`;
    expect(sealed).toHaveLength(2);
    expect(sealed[0].sealed).not.toBe(sealed[1].sealed);
  });
});
