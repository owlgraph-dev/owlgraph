// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // The test harness, for the tests beside the code (docs/guides/testing.md); the app never imports it.
    alias: { $tests: 'tests' },
    // Mode 'auto' nonces SvelteKit's inline hydration script; script-src has no
    // 'unsafe-inline'. style-src is strict: hooks.server.ts adds the style nonce,
    // and 'unsafe-inline' on the authenticated tools' routes (platform/csp.ts).
    // img-src matches the sanitizer's <img> schemes (content/render/sanitize.server.ts).
    // 'unsafe-hashes' admits one handler: Svelte 5's SSR writes onload/onerror=
    // "this.__e=event" for load handlers and spread props (sveltejs/svelte#14014);
    // drop it once the fix (sveltejs/svelte#18314) ships in the Svelte used here.
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', 'unsafe-hashes', 'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='],
        'style-src': ['self'],
        'img-src': ['self', 'https:', 'http:', 'data:'],
        'font-src': ['self'],
        'connect-src': ['self'],
        'object-src': ['none'],
        'base-uri': ['none'],
        'frame-ancestors': ['none'],
        'form-action': ['self'],
      },
    },
  },
};

export default config;
