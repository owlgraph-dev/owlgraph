// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The [namespace] params matcher (src/params.ts). SvelteKit's build also loads
// it with Node, outside Vite, so it imports only by paths Node resolves: the
// registry, which imports nothing.
import { isKnownNamespaceSlug } from './namespaceRegistry.ts';

/** A known namespace slug matches as itself; anything else is undefined, which doesn't match (false would be a value, and would). */
export const matchNamespace = (param: string): string | undefined => (isKnownNamespaceSlug(param) ? param : undefined);
