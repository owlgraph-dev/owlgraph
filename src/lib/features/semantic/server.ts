// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Server-only: every module here is a *.server.ts file, so a client import fails the build.
export * from './nodeClasses.server';
export * from './properties.server';
export * from './relationships.server';
export * from './schemaSeeds.server';
export * from './tags.server';
