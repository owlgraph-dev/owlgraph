// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { flushSync, type Component } from 'svelte';
import { render } from 'svelte/server';
import { compile } from 'svelte/compiler';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { esc } from '$lib/platform/htmlEscape';
import { hydrateIslands, islandMarker } from './hydrateIslands';
import OuterIsland from './fixtures/OuterIsland.svelte';
import InnerIsland from './fixtures/InnerIsland.svelte';

// jsdom resolves `svelte` to its server entry, where hydrate() throws.
vi.mock('svelte', async () => {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/svelte/src/index-client.js')).href);
});

// A component import here compiles for the client, so the server half (what
// ssrBlock renders) is compiled by hand and loaded from a cache file.
const FIXTURES = resolve(__dirname, 'fixtures');
const CACHE = resolve('node_modules/.cache/hydrate-islands-test');
async function serverHalf(file: string): Promise<Component<any>> {
  const filename = join(FIXTURES, file);
  const { js } = compile(readFileSync(filename, 'utf8'), { filename, generate: 'server' });
  mkdirSync(CACHE, { recursive: true });
  const out = join(CACHE, `${basename(file, '.svelte')}.server.js`);
  writeFileSync(out, js.code);
  return (await import(/* @vite-ignore */ pathToFileURL(out).href)).default;
}

describe('an island inside an island', () => {
  it('hydrates both in place; the outer re-renders its own state and never redraws the inner', async () => {
    const [OuterServer, InnerServer] = await Promise.all([serverHalf('OuterIsland.svelte'), serverHalf('InnerIsland.svelte')]);
    const innerProps = { label: 'inner' };
    const inner = `<div${islandMarker('inner', innerProps, esc)}>${render(InnerServer, { props: innerProps }).body}</div>`;
    const outerProps = { inner };
    document.body.innerHTML = `<div${islandMarker('outer', outerProps, esc)}>${render(OuterServer, { props: outerProps }).body}</div>`;
    const innerEl = document.querySelector('.inner');
    expect(innerEl).not.toBeNull();

    const stop = hydrateIslands(document.body, { outer: OuterIsland, inner: InnerIsland });
    flushSync();

    // Claimed, not redrawn.
    expect(document.querySelector('.inner')).toBe(innerEl);
    expect((innerEl as HTMLElement).dataset.hydrated).toBe('true');
    const outer = document.querySelector('.outer') as HTMLElement;
    expect(outer.dataset.hydrated).toBe('true');
    // The outer re-rendered its own state; its unchanged {@html} kept the inner.
    expect(outer.querySelector('.ticks')!.textContent).toBe('1');
    expect(document.querySelector('.inner')).toBe(innerEl);
    expect(document.querySelectorAll('.inner')).toHaveLength(1);
    stop();
  });
});
