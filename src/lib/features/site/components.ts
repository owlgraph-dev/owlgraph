// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The reader's components only (Node tooling imports ./index.ts): the root
// layout imports this barrel for the Footer, so the admin UI lives in ./routes/.
export { default as Footer } from './components/Footer.svelte';
export { default as Logo } from './components/Logo.svelte';
