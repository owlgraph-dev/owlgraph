// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A pasted public share link (`<origin>/s/<token>`, optionally after
// `/index.php`), read for its token only when it is a link of the configured
// server: a share elsewhere is never reached. Only the token is kept, sealed.
import { isShareToken } from '../sharePath';

export type ShareUrlProblem = 'invalid' | 'other-origin' | 'not-a-share';

const SHARE_PATH = /^\/(?:index\.php\/)?s\/([^/]+)(?:\/download)?\/?$/;

export function parseShareUrl(input: string, origin: string): { token: string } | { problem: ShareUrlProblem } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { problem: 'invalid' };
  }
  if (url.username || url.password) return { problem: 'invalid' };
  if (url.origin !== origin) return { problem: 'other-origin' };
  const match = SHARE_PATH.exec(url.pathname);
  return match && isShareToken(match[1]) ? { token: match[1] } : { problem: 'not-a-share' };
}
