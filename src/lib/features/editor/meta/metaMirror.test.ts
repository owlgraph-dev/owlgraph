// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { MetaMirror } from './metaMirror.svelte';

/** A write the test answers when it likes, with each value it was sent. */
function held<A>() {
  const sent: unknown[] = [];
  let answer: (res: A) => void = () => {};
  const write = (value: unknown) => {
    sent.push(value);
    return new Promise<A>((resolve) => (answer = resolve));
  };
  return { sent, write, answer: (res: A) => answer(res) };
}

describe('a node’s metadata as its editor shows it', () => {
  it('starts as loaded, and as nothing where the load had nothing', () => {
    const meta = new MetaMirror({ tags: ['plans'], manualProperties: [{ name: 'core:owner', value: 'Ada' }], visibility: 'restricted', shares: ['u-bea'] }, {});
    expect(meta.tags).toEqual(['plans']);
    expect(meta.manualProperties).toEqual([{ name: 'core:owner', value: 'Ada' }]);
    expect(meta.visibility).toBe('restricted');
    expect(meta.shares).toEqual(['u-bea']);

    const bare = new MetaMirror({}, {});
    expect([bare.tags, bare.manualProperties, bare.visibility, bare.shares]).toEqual([[], [], null, []]);
  });

  it('shows a tag list at once, then the list the server stored', async () => {
    const server = held<{ ok: boolean; tags?: string[] }>();
    const meta = new MetaMirror({ tags: ['plans'] }, { onSetTags: server.write as never });
    const pending = meta.commitTags(['plans', 'Q3']);
    expect(meta.tags).toEqual(['plans', 'Q3']);
    expect(server.sent).toEqual([['plans', 'Q3']]);
    server.answer({ ok: true, tags: ['plans', 'q3'] });
    await pending;
    expect(meta.tags).toEqual(['plans', 'q3']);
  });

  it('keeps what it shows when the server refuses it', async () => {
    const server = held<{ ok: boolean }>();
    const meta = new MetaMirror({ manualProperties: [] }, { onSetManualProperties: server.write as never });
    const pending = meta.commitManualProperties([{ name: 'core:owner', value: 'Ada' }]);
    server.answer({ ok: false });
    await pending;
    expect(meta.manualProperties).toEqual([{ name: 'core:owner', value: 'Ada' }]);
  });

  it('shows a visibility at once, then the stored one, and hands the answer on', async () => {
    const server = held<{ ok: boolean; visibility?: string | null }>();
    const meta = new MetaMirror({ visibility: null }, { onSetVisibility: server.write as never });
    const pending = meta.commitVisibility('restricted');
    expect(meta.visibility).toBe('restricted');
    server.answer({ ok: true, visibility: 'internal' });
    expect(await pending).toEqual({ ok: true, visibility: 'internal' });
    expect(meta.visibility).toBe('internal');

    const refused = meta.commitVisibility('public');
    server.answer({ ok: false });
    await refused;
    expect(meta.visibility).toBe('public');
  });

  it('shows the shares at once, then the stored ones', async () => {
    const server = held<{ ok: boolean; shares?: string[] }>();
    const meta = new MetaMirror({ shares: [] }, { onSetShares: server.write as never });
    const pending = meta.commitShares(['u-bea', 'u-bea']);
    expect(meta.shares).toEqual(['u-bea', 'u-bea']);
    server.answer({ ok: true, shares: ['u-bea'] });
    await pending;
    expect(meta.shares).toEqual(['u-bea']);
  });
});
