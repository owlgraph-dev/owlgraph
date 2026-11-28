// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The [space] params matcher (src/params.ts). SvelteKit's build also loads
// it with Node, outside Vite, so it imports only by paths Node resolves: the
// registry, which imports nothing.
import { spaceOfParam } from './spaceRegistry.ts';

/** A space slug the registry routes matches as that slug; anything else is undefined, which doesn't match (false would be a value, and would). */
export const matchSpace = (param: string): string | undefined => spaceOfParam(param);
