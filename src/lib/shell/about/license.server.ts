// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /-/license: the AGPL 3.0 and its additional permission,
// read into the build, so what is served is what this version was built with.
import license from '../../../../LICENSE?raw';
import pluginException from '../../../../PLUGIN-EXCEPTION.md?raw';

const BODY = `${license.trimEnd()}\n\n\n${'='.repeat(78)}\n\n\n${pluginException.trimEnd()}\n`;

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}
