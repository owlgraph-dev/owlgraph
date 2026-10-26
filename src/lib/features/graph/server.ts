// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Server-only surface of the graph feature. Every module here is a
// *.server.ts file, so importing this barrel from client code fails the build.
export * from './edges.server';
export * from './graph.server';
