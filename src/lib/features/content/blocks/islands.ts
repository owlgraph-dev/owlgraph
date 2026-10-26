// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The components the page hydrates as islands (scaffold/hydrateIslands.ts). Static
// imports, so each component's CSS is in the page's bundle; the server render
// carries none.
import type { Component } from 'svelte';
import QuickLinkCard from './quickLink/QuickLinkCard.svelte';
import Diagram from './diagram/Diagram.svelte';
import { PLUGIN_ISLANDS } from '$lib/plugins/islands';

export const BLOCK_ISLANDS: Readonly<Record<string, Component<any>>> = {
  quickLink: QuickLinkCard,
  diagram: Diagram,
  ...PLUGIN_ISLANDS,
};
