// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// `node --import ./scripts/lib/register-svelte.mjs …`, after `--import tsx`:
// hooks run last-registered-first, so `.svelte` is compiled before tsx sees it.
import { register } from 'node:module';

register('./svelte-hooks.mjs', import.meta.url);
