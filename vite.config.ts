// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig, type Rolldown } from 'vite';

// postcss's package.json maps its node builtins to false for the browser.
// The build honours that; Vite's dev optimizer doesn't, and its stand-in warns
// on every read postcss makes at load. This applies the mapping to imports from
// inside postcss only, so any other package keeps the warning. Dev only.
const POSTCSS_STUB = '\0postcss-browser-field:';
const honourPostcssBrowserField: Rolldown.Plugin = {
  name: 'postcss-browser-field',
  resolveId(source, importer) {
    if (!importer || !/^(path|fs|url|source-map-js)$/.test(source)) return null;
    // By path segment, for either separator and never a package named *-postcss.
    const segments = importer.split(/[^A-Za-z0-9_.-]+/);
    const insidePostcss = segments.some((segment, i) => segment === 'node_modules' && segments[i + 1] === 'postcss');
    return insidePostcss ? POSTCSS_STUB + source : null;
  },
  // postcss only destructures these in the browser; a call would throw.
  load(id) {
    return id.startsWith(POSTCSS_STUB) ? { code: 'module.exports = {};', moduleType: 'js' } : null;
  },
};

export default defineConfig({
  optimizeDeps: { rolldownOptions: { plugins: [honourPostcssBrowserField] } },
  plugins: [
    // Keep these the same as `npm run messages`' flags, which compile the
    // same output outside Vite on install.
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      emitTsDeclarations: true,
      // The app decides the language (docs/architecture/languages.md) and hands Paraglide a
      // cookie carrying only that (hooks.server.ts); baseLocale is the floor
      // outside a request.
      strategy: ['cookie', 'baseLocale'],
    }),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      // $lib, which SvelteKit no longer declares itself, and the test harness,
      // for the tests beside the code (docs/guides/testing.md); the app never
      // imports $tests.
      alias: { $lib: 'src/lib', $tests: 'tests' },
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
    }),
  ],
});
