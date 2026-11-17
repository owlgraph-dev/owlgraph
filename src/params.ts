// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// /foo/edit is either [namespace]/[slug] or [slug]/edit, and SvelteKit would
// always prefer the static "edit", hiding a node slugged "edit" in a namespace.
// The namespace matcher tries the namespace first (docs/architecture/routing.md, "The routing
// ambiguity, and the params matcher that resolves it"). SvelteKit's build loads
// this file with Node, outside Vite: it imports by paths Node resolves.
import { defineParams } from '@sveltejs/kit/params';
import { matchNamespace } from './lib/features/namespaces/matcher.ts';

export const params = defineParams({ namespace: matchNamespace });
