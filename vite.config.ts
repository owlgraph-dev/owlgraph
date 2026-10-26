// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';
import type { Plugin as EsbuildPlugin } from 'esbuild';

// postcss's package.json maps its node builtins to false for the browser.
// Rollup honours that; Vite's dev optimizer doesn't, and its stand-in warns on
// every read postcss makes at load. This applies the mapping to imports from
// inside postcss only, so any other package keeps the warning. Dev only.
const honourPostcssBrowserField: EsbuildPlugin = {
  name: 'postcss-browser-field',
  setup(build) {
    const NODE_ONLY = /^(path|fs|url|source-map-js)$/;
    const NAMESPACE = 'postcss-browser-field-stub';
    // By path segment, for either separator and never a package named *-postcss.
    const insidePostcss = (importer: string) => {
      const segments = importer.split(/[^A-Za-z0-9_.-]+/);
      return segments.some((segment, i) => segment === 'node_modules' && segments[i + 1] === 'postcss');
    };
    build.onResolve({ filter: NODE_ONLY }, (args) =>
      insidePostcss(args.importer) ? { path: args.path, namespace: NAMESPACE } : null
    );
    // postcss only destructures these in the browser; a call would throw.
    build.onLoad({ filter: /.*/, namespace: NAMESPACE }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
  },
};

export default defineConfig({
  optimizeDeps: { esbuildOptions: { plugins: [honourPostcssBrowserField] } },
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
    sveltekit(),
  ],
});
