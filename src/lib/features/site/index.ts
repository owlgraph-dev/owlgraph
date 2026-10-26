// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Plain TypeScript only, safe in the browser, the server and Node tooling.
// Components live in ./components.ts, server modules in ./server.ts; never
// re-export either here.
export * from './types';

// The compiler stays out of this barrel (customStyles/load.ts).
export { slugFromLabel } from './customStyles/slug';
export { contentTokens, type ContentToken } from './customStyles/contentTokens';
