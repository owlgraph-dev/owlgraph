// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Where this build's source is offered (AGPL-3.0 §13; docs/guides/deployment.md, "Source
// code for network users"), for the About page and the MCP serverInfo. An
// operator running modified code must point SOURCE_URL at their own source.
// Read from process.env: the MCP process imports this too.

export const UPSTREAM_SOURCE_URL = 'https://github.com/owlgraph-dev/owlgraph';

export interface SourceInfo {
  /** The repository's address: an http(s) URL. */
  url: string;
  /** The commit (or tag) this build was made from, or `dev`. */
  revision: string;
}

/** The configured source location, falling back to the upstream repository for a value that is unset or not an http(s) URL. */
export function sourceInfo(env: NodeJS.ProcessEnv = process.env): SourceInfo {
  const url = (env.SOURCE_URL ?? '').trim();
  // Printed beside the link, so only a commit hash's, tag's or branch's characters.
  const revision = (env.SOURCE_REVISION ?? '').trim();
  return {
    url: /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : UPSTREAM_SOURCE_URL,
    revision: /^[\w.+/-]{1,64}$/.test(revision) ? revision : 'dev',
  };
}

/** The tree at the revision (a path GitHub, GitLab, Gitea and Forgejo all
 * serve); a `dev` build gets the repository itself. */
export function sourceHref({ url, revision }: SourceInfo): string {
  if (revision === 'dev') return url;
  return `${url.replace(/\/+$/, '').replace(/\.git$/, '')}/tree/${revision}`;
}
