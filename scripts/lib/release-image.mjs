// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a release tag publishes as the image (docs/guides/branches-and-releases.md,
// "Publishing a release"), apart from the I/O around it (scripts/release-image.mjs):
// a release vX.Y.Z is published as X.Y.Z; X.Y follows the highest patch of its
// minor version and `latest` the highest stable release, both judged from the
// release tags; a pre-release is published under its own version only. A tag
// that does not match package.json, or whose version is already published,
// publishes nothing: a published version is never replaced.

/** A refusal to publish, with what to do instead. */
export class ReleaseRefused extends Error {}

// Semantic Versioning's grammar, with no build metadata: an image tag cannot carry `+`.
const IDENTIFIER = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const RELEASE_TAG = new RegExp(String.raw`^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(${IDENTIFIER}(?:\.${IDENTIFIER})*))?$`);

/**
 * A release tag's parts, or null for any other tag.
 * @param {string} tag
 * @returns {{ version: string, core: [number, number, number], prerelease: string | null } | null}
 */
export function parseReleaseTag(tag) {
  const m = RELEASE_TAG.exec(tag);
  if (!m) return null;
  return { version: tag.slice(1), core: [Number(m[1]), Number(m[2]), Number(m[3])], prerelease: m[4] ?? null };
}

/** @param {[number, number, number]} a @param {[number, number, number]} b */
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The image tags a release tag publishes, highest priority first: its version,
 * then X.Y and `latest` where it is the highest. Throws ReleaseRefused when it
 * publishes nothing.
 * @param {{ tag: string, packageVersion: string, releaseTags: readonly string[], published: boolean, image?: string }} input
 * @returns {{ version: string, tags: string[] }}
 */
export function planRelease({ tag, packageVersion, releaseTags, published, image = 'the image' }) {
  const release = parseReleaseTag(tag);
  if (!release) {
    throw new ReleaseRefused(`${tag} is not a release tag: a release is vX.Y.Z, or vX.Y.Z-<pre-release> (docs/guides/branches-and-releases.md).`);
  }
  if (release.version !== packageVersion) {
    throw new ReleaseRefused(
      `The tag ${tag} names ${release.version}, but package.json names ${packageVersion}. ` +
        'The version is bumped before the release is tagged, and a tag is never moved: the next release takes the next version.'
    );
  }
  if (published) {
    throw new ReleaseRefused(`${image}:${release.version} is already published, and a published version is never replaced: a fix is a new patch release.`);
  }

  const tags = [release.version];
  if (release.prerelease) return { version: release.version, tags };

  const stable = releaseTags.map(parseReleaseTag).flatMap((r) => (r && !r.prerelease ? [r.core] : []));
  const [major, minor] = release.core;
  const atLeast = (/** @type {[number, number, number][]} */ others) => others.every((core) => compare(core, release.core) <= 0);
  if (atLeast(stable.filter(([x, y]) => x === major && y === minor))) tags.push(`${major}.${minor}`);
  if (atLeast(stable)) tags.push('latest');
  return { version: release.version, tags };
}

const MANIFESTS = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

/**
 * Whether `image:tag` exists in its registry, asked with the credentials the
 * push uses. `unreadable` — refused — means those credentials cannot read it,
 * so they cannot write it either: the package does not exist yet, or the push
 * is refused too. Either way nothing published can be replaced. Any other
 * answer throws, since it says nothing.
 * @param {{ image: string, tag: string, username: string, token: string, fetch?: typeof globalThis.fetch }} input
 * @returns {Promise<'published' | 'absent' | 'unreadable'>}
 */
export async function registryState({ image, tag, username, token, fetch = globalThis.fetch }) {
  const slash = image.indexOf('/');
  const host = image.slice(0, slash);
  const name = image.slice(slash + 1);
  const refused = (/** @type {number} */ status) => status === 401 || status === 403;

  const basic = Buffer.from(`${username}:${token}`).toString('base64');
  const auth = await fetch(`https://${host}/token?scope=${encodeURIComponent(`repository:${name}:pull`)}&service=${host}`, {
    headers: { authorization: `Basic ${basic}` },
  });
  if (refused(auth.status)) return 'unreadable';
  if (!auth.ok) throw new Error(`${host} answered ${auth.status} when asked for a token to read ${name}.`);
  const { token: bearer } = await auth.json();

  const head = await fetch(`https://${host}/v2/${name}/manifests/${tag}`, {
    method: 'HEAD',
    headers: { authorization: `Bearer ${bearer}`, accept: MANIFESTS },
  });
  if (head.ok) return 'published';
  if (head.status === 404) return 'absent';
  if (refused(head.status)) return 'unreadable';
  throw new Error(`${host} answered ${head.status} when asked whether ${image}:${tag} exists.`);
}
