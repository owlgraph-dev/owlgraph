// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { parseReleaseTag, planRelease, registryState, ReleaseRefused } from './release-image.mjs';

const IMAGE = 'ghcr.io/owlgraph-dev/owlgraph';

/** The tags `tag` publishes when `others` are the repository's other release tags. */
const tagsOf = (tag: string, others: string[] = []) =>
  planRelease({ tag, packageVersion: tag.slice(1), releaseTags: [...others, tag], published: false }).tags;

describe('planRelease', () => {
  it('publishes the highest stable release as its version, its minor version and latest', () => {
    expect(tagsOf('v0.1.1', ['v0.1.0'])).toEqual(['0.1.1', '0.1', 'latest']);
    expect(tagsOf('v0.2.0', ['v0.1.0', 'v0.1.1'])).toEqual(['0.2.0', '0.2', 'latest']);
  });

  it('leaves latest alone for a patch release of an older minor version', () => {
    expect(tagsOf('v0.1.2', ['v0.1.0', 'v0.1.1', 'v0.2.0'])).toEqual(['0.1.2', '0.1']);
  });

  it('moves neither when a higher patch of the same minor version exists', () => {
    expect(tagsOf('v0.1.1', ['v0.1.2', 'v0.2.0'])).toEqual(['0.1.1']);
  });

  it('publishes a pre-release under its own version only', () => {
    expect(tagsOf('v0.2.0-rc.1', ['v0.1.1'])).toEqual(['0.2.0-rc.1']);
  });

  it('judges the highest release among the stable ones only', () => {
    expect(tagsOf('v0.1.2', ['v0.1.1', 'v0.2.0-rc.1', 'v0.3.0-beta'])).toEqual(['0.1.2', '0.1', 'latest']);
  });

  it('compares versions as numbers', () => {
    expect(tagsOf('v0.10.0', ['v0.9.3', 'v0.2.0'])).toEqual(['0.10.0', '0.10', 'latest']);
    expect(tagsOf('v0.9.4', ['v0.10.0', 'v0.9.3'])).toEqual(['0.9.4', '0.9']);
  });

  it('publishes no tag for the major version alone', () => {
    expect(tagsOf('v1.0.0', ['v0.9.0'])).toEqual(['1.0.0', '1.0', 'latest']);
  });

  it('ignores tags that are not releases, and counts the release itself when the list lacks it', () => {
    const plan = planRelease({ tag: 'v0.1.1', packageVersion: '0.1.1', releaseTags: ['v9', 'vnext', 'v1.0.0.0', 'v2.0.0+build'], published: false });
    expect(plan).toEqual({ version: '0.1.1', tags: ['0.1.1', '0.1', 'latest'] });
  });

  it('refuses a tag whose version differs from package.json', () => {
    const refuse = () => planRelease({ tag: 'v0.1.2', packageVersion: '0.1.1', releaseTags: ['v0.1.2'], published: false });
    expect(refuse).toThrow(ReleaseRefused);
    expect(refuse).toThrow(/names 0\.1\.2, but package\.json names 0\.1\.1/);
    expect(() => planRelease({ tag: 'v0.2.0-rc.1', packageVersion: '0.2.0', releaseTags: [], published: false })).toThrow(ReleaseRefused);
  });

  it('refuses a version that is already published', () => {
    const refuse = () => planRelease({ tag: 'v0.1.1', packageVersion: '0.1.1', releaseTags: ['v0.1.1'], published: true, image: IMAGE });
    expect(refuse).toThrow(ReleaseRefused);
    expect(refuse).toThrow(`${IMAGE}:0.1.1 is already published`);
  });

  it('refuses a tag that is not a release', () => {
    for (const tag of ['0.1.1', 'v0.1', 'v01.2.3', 'v1.2.3.4', 'v1.2.3+build.5', 'v1.2.3-', 'v1.2.3-rc..1', 'v1.2.3-01', 'v1.2.3 ']) {
      expect(() => planRelease({ tag, packageVersion: tag.slice(1), releaseTags: [], published: false }), tag).toThrow(ReleaseRefused);
    }
  });
});

describe('parseReleaseTag', () => {
  it('splits a release tag into its version, its numbers and its pre-release', () => {
    expect(parseReleaseTag('v1.20.3')).toEqual({ version: '1.20.3', core: [1, 20, 3], prerelease: null });
    expect(parseReleaseTag('v0.2.0-rc.1')).toEqual({ version: '0.2.0-rc.1', core: [0, 2, 0], prerelease: 'rc.1' });
    expect(parseReleaseTag('release-1')).toBeNull();
  });
});

describe('registryState', () => {
  type Answer = { status: number; body?: unknown };

  /** A registry that answers the token request and the manifest request as given, and records both. */
  function registry(token: Answer, manifest: Answer = { status: 404 }) {
    const requests: { url: string; method: string; authorization: string; accept?: string }[] = [];
    const fetch = (async (url: string, init: RequestInit = {}) => {
      const headers = init.headers as Record<string, string>;
      requests.push({ url, method: init.method ?? 'GET', authorization: headers.authorization, accept: headers.accept });
      const answer = url.includes('/token?') ? token : manifest;
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status });
    }) as typeof globalThis.fetch;
    return { fetch, requests };
  }

  const ask = (fetch: typeof globalThis.fetch) => registryState({ image: IMAGE, tag: '0.1.1', username: 'octocat', token: 's3cret', fetch });

  it('asks for a token with the push credentials, then for the manifest with it', async () => {
    const { fetch, requests } = registry({ status: 200, body: { token: 'bearer-token' } }, { status: 200 });
    expect(await ask(fetch)).toBe('published');
    expect(requests[0].url).toBe('https://ghcr.io/token?scope=repository%3Aowlgraph-dev%2Fowlgraph%3Apull&service=ghcr.io');
    expect(requests[0].authorization).toBe(`Basic ${Buffer.from('octocat:s3cret').toString('base64')}`);
    expect(requests[1]).toMatchObject({ url: 'https://ghcr.io/v2/owlgraph-dev/owlgraph/manifests/0.1.1', method: 'HEAD', authorization: 'Bearer bearer-token' });
    expect(requests[1].accept).toContain('application/vnd.oci.image.index.v1+json');
  });

  it('reads a missing manifest as not published', async () => {
    expect(await ask(registry({ status: 200, body: { token: 't' } }, { status: 404 }).fetch)).toBe('absent');
  });

  it('reads a refusal as unreadable, from the token request or the manifest request', async () => {
    expect(await ask(registry({ status: 403, body: { errors: [{ code: 'DENIED' }] } }).fetch)).toBe('unreadable');
    expect(await ask(registry({ status: 401 }).fetch)).toBe('unreadable');
    expect(await ask(registry({ status: 200, body: { token: 't' } }, { status: 403 }).fetch)).toBe('unreadable');
  });

  it('throws for any other answer, which says nothing', async () => {
    await expect(ask(registry({ status: 500 }).fetch)).rejects.toThrow('ghcr.io answered 500 when asked for a token');
    await expect(ask(registry({ status: 200, body: { token: 't' } }, { status: 502 }).fetch)).rejects.toThrow(
      'ghcr.io answered 502 when asked whether ghcr.io/owlgraph-dev/owlgraph:0.1.1 exists'
    );
  });
});
