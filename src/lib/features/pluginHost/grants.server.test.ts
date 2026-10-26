// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createSecretBox } from '$lib/platform/secretBox.server';
import type { PluginOpenConnection } from '$lib/plugins/api';
import { createGrants, GRANT_TTL_MS, type GrantDeps } from './grants.server';

const box = createSecretBox(randomBytes(32).toString('base64'));
const NODE = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';
const T0 = 1_800_000_000_000;
const CONNECTION: PluginOpenConnection = { id: 'c-1', accountId: 'alice', accountLabel: 'Alice Example', credential: { kind: 'app_password', login: 'alice', secret: 'app-pass-1' } };

/** A fake plugin's grants for viewer `u1`, every node readable unless the test says otherwise. */
function grants(over: Partial<GrantDeps> = {}) {
  const grantedNodes: string[] = [];
  const deps: GrantDeps = {
    pluginId: 'acme',
    viewerId: 'u1',
    shareLink: null,
    seal: (plaintext) => box.seal('signed-url', plaintext),
    open: (sealed) => box.open('signed-url', sealed),
    now: () => T0,
    canRead: async () => true,
    shareLinkGrants: async () => false,
    granted: (nodeId) => grantedNodes.push(nodeId),
    openConnection: async () => null,
    ...over,
  };
  return { ...createGrants(deps), grantedNodes };
}

describe('a grant', () => {
  it('is redeemed by the viewer it was minted for, and grants the node to that request', async () => {
    const token = await grants().issue(NODE, { p: 'Reports/2026.pdf', f: 42 });
    expect(token).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    const redeeming = grants();
    expect(await redeeming.redeem(token!)).toEqual({ nodeId: NODE, detail: { p: 'Reports/2026.pdf', f: 42 }, via: 'node' });
    expect(redeeming.grantedNodes).toEqual([NODE]);
  });

  it('shows nothing of what it grants: not the node, the detail or the viewer', async () => {
    // Probes long enough that random ciphertext cannot hold one by chance.
    const viewerId = 'viewer-4d2a9b7e';
    const token = (await grants({ viewerId }).issue(NODE, { p: 'Geheim/Bericht.pdf' }))!;
    for (const part of [NODE, 'Geheim', 'Bericht', viewerId, 'acme']) expect(token).not.toContain(part);
  });

  it('is not minted for a node the viewer may not read', async () => {
    expect(await grants({ canRead: async () => false }).issue(NODE, {})).toBeNull();
  });

  it('runs out after five minutes', async () => {
    const token = (await grants().issue(NODE, {}))!;
    expect(await grants({ now: () => T0 + GRANT_TTL_MS - 1 }).redeem(token)).not.toBeNull();
    expect(await grants({ now: () => T0 + GRANT_TTL_MS }).redeem(token)).toBe('expired');
  });

  it('is refused to another viewer, and to an anonymous one', async () => {
    const token = (await grants().issue(NODE, {}))!;
    expect(await grants({ viewerId: 'u2' }).redeem(token)).toBeNull();
    expect(await grants({ viewerId: null }).redeem(token)).toBeNull();
  });

  it("minted for an anonymous viewer is anyone's — while the node is still theirs to read", async () => {
    const token = (await grants({ viewerId: null }).issue(NODE, {}))!;
    expect(await grants({ viewerId: 'u2' }).redeem(token)).not.toBeNull();
    expect(await grants({ viewerId: null }).redeem(token)).not.toBeNull();
    expect(await grants({ viewerId: null, canRead: async () => false }).redeem(token)).toBeNull();
  });

  it('is refused once the viewer may no longer read the node', async () => {
    const token = (await grants().issue(NODE, {}))!;
    const redeeming = grants({ canRead: async () => false });
    expect(await redeeming.redeem(token)).toBeNull();
    expect(redeeming.grantedNodes).toEqual([]);
  });

  it('minted through a share link re-checks the link, not the viewer', async () => {
    const token = (await grants({ viewerId: null, shareLink: 'link-token' }).issue(NODE, {}))!;
    let asked: [string, string] | null = null;
    const stillGranted = grants({
      viewerId: null,
      canRead: async () => false,
      shareLinkGrants: async (link, nodeId) => {
        asked = [link, nodeId];
        return true;
      },
    });
    expect(await stillGranted.redeem(token)).not.toBeNull();
    expect(asked).toEqual(['link-token', NODE]);
    // Revoked: the link no longer grants the node, whoever asks.
    expect(await grants({ viewerId: 'u1', canRead: async () => true, shareLinkGrants: async () => false }).redeem(token)).toBeNull();
  });

  it("refuses a token that was altered, sealed for another purpose, or is another plugin's", async () => {
    const token = (await grants().issue(NODE, {}))!;
    const last = token.at(-2) === 'A' ? 'B' : 'A';
    expect(await grants().redeem(token.slice(0, -2) + last + token.at(-1))).toBeNull();
    expect(await grants().redeem(box.seal('node-source-secret', JSON.stringify({ v: 1, p: 'acme', n: NODE, d: {}, e: T0 + 1, u: 'u1', l: null })))).toBeNull();
    expect(await grants({ pluginId: 'other' }).redeem(token)).toBeNull();
    expect(await grants().redeem('not-a-token')).toBeNull();
    expect(await grants().redeem('x'.repeat(5000))).toBeNull();
  });

  it('refuses a sealed value that is not a grant', async () => {
    for (const plaintext of ['[]', '"x"', '{}', JSON.stringify({ v: 2, p: 'acme', n: NODE, d: {}, e: T0 + 1, u: 'u1', l: null }), JSON.stringify({ v: 1, p: 'acme', n: NODE, d: { x: {} }, e: T0 + 1, u: 'u1', l: null })]) {
      expect(await grants().redeem(box.seal('signed-url', plaintext)), plaintext).toBeNull();
    }
  });

  it("minted for the viewer's connection reads with that connection — and asks to renew it once it is gone, never falling back", async () => {
    const connected = { openConnection: async () => CONNECTION };
    expect(await grants().issue(NODE, {}, { via: 'user' }), 'no connection, no grant').toBeNull();
    const token = (await grants(connected).issue(NODE, { p: 'Team/a.txt', f: 7 }, { via: 'user' }))!;
    expect(token).not.toContain('c-1');
    const redeeming = grants(connected);
    expect(await redeeming.redeem(token)).toEqual({ nodeId: NODE, detail: { p: 'Team/a.txt', f: 7 }, via: 'user', connection: CONNECTION });
    expect(redeeming.grantedNodes).toEqual([NODE]);
    // Disconnected, or connected anew (another id): renew — the node stays not granted.
    for (const now of [null, { ...CONNECTION, id: 'c-2' }]) {
      const after = grants({ openConnection: async () => now });
      expect(await after.redeem(token)).toBe('renew');
      expect(after.grantedNodes).toEqual([]);
    }
    // Still another viewer's grant for anyone else, and still the node's access first.
    expect(await grants({ ...connected, viewerId: 'u2' }).redeem(token)).toBeNull();
    expect(await grants({ ...connected, canRead: async () => false }).redeem(token)).toBeNull();
  });

  it("is never minted for a connection to an anonymous viewer or through a share link", async () => {
    const connected = { openConnection: async () => CONNECTION };
    expect(await grants({ ...connected, viewerId: null }).issue(NODE, {}, { via: 'user' })).toBeNull();
    expect(await grants({ ...connected, shareLink: 'link-token' }).issue(NODE, {}, { via: 'user' })).toBeNull();
    // Nor does a hand-made one pass: a connection's grant names a signed-in viewer and no share link.
    for (const payload of [
      { v: 1, p: 'acme', n: NODE, d: {}, e: T0 + 1, u: null, l: null, c: 'c-1' },
      { v: 1, p: 'acme', n: NODE, d: {}, e: T0 + 1, u: 'u1', l: 'link-token', c: 'c-1' },
      { v: 1, p: 'acme', n: NODE, d: {}, e: T0 + 1, u: 'u1', l: null, c: 7 },
    ]) {
      expect(await grants({ ...connected, shareLinkGrants: async () => true }).redeem(box.seal('signed-url', JSON.stringify(payload)))).toBeNull();
    }
  });

  it("minted before connections (no `c`) reads with the node's own credential", async () => {
    const token = box.seal('signed-url', JSON.stringify({ v: 1, p: 'acme', n: NODE, d: { f: 1 }, e: T0 + 1, u: 'u1', l: null }));
    expect(await grants({ openConnection: async () => CONNECTION }).redeem(token)).toEqual({ nodeId: NODE, detail: { f: 1 }, via: 'node' });
  });

  it('is minted for nothing without a key', async () => {
    const noKey = grants({
      seal: () => {
        throw new Error('APP_SECRET_KEY is not set');
      },
    });
    expect(await noKey.issue(NODE, {})).toBeNull();
  });
});
