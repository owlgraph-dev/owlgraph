---
status: implemented
issue:
adrs: ['0014']
updated: 2026-11-16
---

# 001. A published Docker image

## Problem

Running owlgraph means cloning the repository and building the image on the
host ([deployment.md](../guides/deployment.md)). Someone who runs it as one
part of a larger infrastructure stack wants to name a released version and
pull it, as they do for every other service: without the source on the host,
without the 6 GB of memory the build needs, and with an upgrade that is a
changed version number.

A release exists today only as a git tag
([branches-and-releases.md](../guides/branches-and-releases.md#publishing-a-release)).
Nothing publishes the image that tag builds.

## Scope

- **Every release has an image.** Pushing a release tag `vX.Y.Z` publishes the
  image built from that tag to the GitHub Container Registry, as
  `ghcr.io/owlgraph-dev/owlgraph`, publicly pullable without an account.
- **For two platforms.** One image name serves `linux/amd64` and
  `linux/arm64`.
- **Under predictable tags.** A release `vX.Y.Z` is published as `X.Y.Z` and
  as `X.Y`, which follows the patch releases of that minor version. `latest`
  names the highest stable release. A pre-release (`vX.Y.Z-rc.N`) is published
  under its own version only.
- **The stack runs from it.** A compose override, `docker-compose.image.yml`,
  layered on `docker-compose.yml`, makes `migrate`, `app` and `mcp` run a
  published image instead of building one. Which image is one setting,
  `OWLGRAPH_IMAGE`, so a fork can name its own. The production override
  layers on top as before.
- **An upgrade is a pull.** With a published image, upgrading is a backup, a
  new version in `OWLGRAPH_IMAGE`, a pull and a restart; `migrate` does the
  rest as it does today.
- **The image says what it is.** It names its version, its licence and the
  source it was built from, in its labels and on the About page, where the
  source link opens the release's tag.
- **The image is checked before it matters.** A pull request that touches what
  the image is built from builds it and starts the stack from it, without
  publishing anything. A release does the same before it publishes.
- **The first published release is `v0.1.1`.**

## Non-goals

- An image for `v0.1.0`: its tag predates this feature, and tags are never
  moved.
- Images of `main` or of any untagged commit.
- A second registry, such as Docker Hub.
- Plugins from outside the repository in the image. A plugin is compiled in
  ([plugins.md](../architecture/plugins.md#the-plugin-interface)), so the
  published image holds what the repository holds; an installation with its
  own plugins builds its own image.
- Running the backup, restore and search backfill scripts from the image. They
  stay host-side scripts that need a checkout
  ([backup.md](../guides/backup.md)); the guides say so for an image-only
  installation, and nothing more.
- Image signing beyond a build attestation, and vulnerability scanning.
- Creating the tag, the GitHub Release or the version bump, and the
  organization's and the package's settings: these are the maintainer's.

## Acceptance criteria

- After `v0.1.1` is tagged, `docker pull ghcr.io/owlgraph-dev/owlgraph:0.1.1`
  works on a machine that is not signed in to the registry, on amd64 and on
  arm64, and `0.1` and `latest` name the same image.
- A host with Docker, the compose files of that tag and a filled-in `.env`,
  but no checkout and no Node, brings the stack up from the published image:
  `migrate` exits 0, `app` and `mcp` become healthy, and the first admin can
  be created and can sign in.
- On that stack, the About page (`/-/about`) shows version 0.1.1, and its
  source link opens the repository at the tag `v0.1.1`.
- The published image carries the licence, the plugin exception and the
  third-party notices, and its labels name its version, its revision, its
  licence (`AGPL-3.0-only`) and the repository.
- `docker compose up -d --build` from a checkout behaves as it did before.
- With the image override and no `OWLGRAPH_IMAGE` set, compose stops with a
  message that says what to set.
- A patch release of an older minor version does not move `latest`, and a
  pre-release moves neither `latest` nor `X.Y`.
- A tag whose version differs from the one in `package.json` publishes
  nothing, and neither does a tag whose version is already published.
- A pull request that breaks the image's build, or the stack's start from it,
  fails a check before it is merged. That check runs for a pull request from a
  fork too, and publishes nothing.
- The image's provenance can be verified against the repository.
- The guides describe running, upgrading and backing up an installation that
  uses a published image, and how a release publishes one.

## Affected components

- The `Dockerfile`, where building for two platforms needs it.
- The compose files: the new override beside `docker-compose.yml` and
  `docker-compose.prod.yml`, and the two example `.env` files.
- CI: a workflow of its own for the image, beside `.github/workflows/ci.yml`,
  and the base image among what `.github/dependabot.yml` keeps current.
- [Deployment](../guides/deployment.md): running a published image, what the
  image expects of a stack written by hand, and what
  [Source code for network users](../guides/deployment.md#source-code-for-network-users)
  says about the image's labels.
- [Upgrading](../guides/upgrading.md), [Backup and restore](../guides/backup.md)
  and the front page's getting started: the path without a checkout.
- [Branches, pull requests and releases](../guides/branches-and-releases.md#publishing-a-release):
  what a tag publishes, and what has to be true of it.
- [Testing](../guides/testing.md#ci-contract): what the image's check covers.

## Decisions and constraints

- **The source offer travels with the image**
  ([decision 0014](../adr/0014-agpl-with-a-plugin-exception.md)). A published
  image is built with the release's tag as its source revision and the
  upstream repository as its source, so the About page of an unmodified
  installation offers exactly the code it runs. The image keeps carrying the
  licence texts.
- **Only a tag publishes.** A release is a tag
  ([branches-and-releases.md](../guides/branches-and-releases.md)); nothing
  else writes to the registry, and an agent never creates a tag.
- **A published version is never replaced**, as a tag is never moved. A broken
  image is followed by a new patch release.
- **Image tags carry no `v`, and there is no tag for the major version alone**
  while it is 0, since a minor release may break.
- **No new secret.** Publishing authenticates as the workflow itself. Only the
  publishing job may write packages; the check on pull requests has read
  access and never signs in to a registry.
- **`docker-compose.yml` stays as it is.** The image is an override, so the
  services are defined once and building from a checkout is unchanged.
- **The image itself stays what it is:** one image for `app`, `mcp` and
  `migrate`, no default command, a non-root user, no secrets in it.
- **Compose 2.24.4 or newer**, which the production override already assumes.
- **The existing gate is not slowed down.** The image's check runs only for
  changes that can affect the image.

## Open questions

None blocks the work.

- Should a later release also publish an image of `main`, for trying a change
  ahead of a tag?
- Should an image-only installation get a supported way to back up and
  restore, in place of the host-side scripts?

## Implementation notes

- **The revision label names the commit.** A published image's
  `org.opencontainers.image.revision` is the commit its tag points to, which
  is what registries and tools expect there; the tag is its `SOURCE_REVISION`,
  which the About page shows and links. Its `version` label is `X.Y.Z`.
- **No tag for the major version alone, from 1.0 on either.** The scope names
  none; adding one is a change to `scripts/lib/release-image.mjs`.
- **Whether a version is published is asked of the registry** with the
  publishing job's own token, and a refusal reads as not published: ghcr.io
  answers a missing package and an unreadable one alike, and credentials that
  cannot read a package cannot write it either, so the push then creates it or
  is refused too. Its answer for the first release is only seen on a real tag.
- **An upgrade from a published image also takes the release's compose
  files.** [Upgrading](../guides/upgrading.md#from-a-published-image) replaces
  them with the new tag's before naming the new version, since the stack an
  image expects belongs to its release.
- **The check covers more than the stack's start:** the About page's version
  and source link, the licence texts, the first admin's creation and sign-in,
  and sharp's native binding, without which sharp silently falls back to its
  WebAssembly build. A release also loads the native modules of its arm64
  build before publishing; the whole stack runs on amd64 only.
- **The provenance is `actions/attest`'s signed attestation**
  (`attest-build-provenance` is now a wrapper of it), without an artifact
  storage record, so the publishing job needs no permission beyond
  `packages`, `id-token` and `attestations`. BuildKit's own unsigned
  provenance is off.
- **A fork publishes to its own namespace:** the image is
  `ghcr.io/<owner>/<repository>`, built with that repository as its source.
- **A run whose push succeeded and whose attestation failed cannot be re-run:**
  the already-published check stops it, and the version stays without an
  attestation unless a patch release follows.
- **The base image is not pinned by digest.** Its tag names a Node major
  version, so Dependabot proposes newer majors, odd ones too; pinning a digest
  would go beyond what building for two platforms needs of the `Dockerfile`.
