// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a release tag publishes as the image, for the publish job of
// .github/workflows/image.yml (docs/guides/branches-and-releases.md, "Publishing a
// release"); the decision itself is scripts/lib/release-image.mjs. Exits
// non-zero, before anything is built, when the tag publishes nothing.
//
//   node scripts/release-image.mjs <tag>
//
// The image is ghcr.io/<GITHUB_REPOSITORY>, and the registry is asked with
// REGISTRY_TOKEN as GITHUB_ACTOR, the credentials the push uses. The release
// tags are the checkout's (the job fetches them all). The result goes to
// GITHUB_OUTPUT: image, version, revision, source, description, and tags and
// build-args as the metadata and build actions take them.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRelease, registryState, ReleaseRefused } from './lib/release-image.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} name */
function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set; the publish job sets it (.github/workflows/image.yml).`);
    process.exit(2);
  }
  return value;
}

const tag = process.argv[2];
if (!tag) {
  console.error('Usage: node scripts/release-image.mjs <tag>');
  process.exit(2);
}
const repository = required('GITHUB_REPOSITORY');
const token = required('REGISTRY_TOKEN');
const username = required('GITHUB_ACTOR');
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const releaseTags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const image = `ghcr.io/${repository.toLowerCase()}`;

let plan;
try {
  // A tag that is no release, or does not match package.json, is refused before the registry is asked.
  planRelease({ tag, packageVersion: pkg.version, releaseTags, published: false, image });
  const state = await registryState({ image, tag: tag.slice(1), username, token });
  if (state === 'unreadable') console.log(`${image} is not readable with the job's token, so not writable either: it does not exist yet, or the push is refused.`);
  plan = planRelease({ tag, packageVersion: pkg.version, releaseTags, published: state === 'published', image });
} catch (e) {
  console.error(e instanceof ReleaseRefused ? `Nothing is published: ${e.message}` : e);
  process.exit(1);
}

const source = `${serverUrl}/${repository}`;
const outputs = {
  image,
  version: plan.version,
  revision: tag,
  source,
  description: pkg.description ?? '',
  tags: plan.tags.map((t) => `type=raw,value=${t}`).join('\n'),
  'build-args': [`SOURCE_URL=${source}`, `SOURCE_REVISION=${tag}`].join('\n'),
};

console.log(`Publishes ${image} as ${plan.tags.join(', ')}.`);
if (process.env.GITHUB_OUTPUT) {
  const lines = Object.entries(outputs).map(([key, value]) => {
    const end = `EOF_${randomBytes(8).toString('hex')}`;
    return `${key}<<${end}\n${value}\n${end}\n`;
  });
  appendFileSync(process.env.GITHUB_OUTPUT, lines.join(''));
} else {
  console.log(outputs);
}
