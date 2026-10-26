// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The browser's only path to the CSS compiler, and a dynamic one: postcss is
// heavy and not side-effect-free, so one eager import from the components
// barrel puts it on every page. Keep every reference to the compiler modules
// dynamic or type-only (check-boundaries.mjs enforces it).
import type { CompileSheet, CssIssue } from './compile';
import type { StyleWarning } from './warnings';
import type { StyleKind } from '../types';

export interface CustomStyleTools {
  compileStyleCss: (css: string, slug: string) => { css: string; issues: CssIssue[] };
  compileStylesheets: (sheets: CompileSheet[]) => { css: string };
  styleWarnings: (css: string, kind: StyleKind) => StyleWarning[];
}

let pending: Promise<CustomStyleTools> | null = null;

/** The compiler and its advice, loaded once per session and shared. */
export function loadCustomStyleTools(): Promise<CustomStyleTools> {
  pending ??= Promise.all([import('./compile'), import('./warnings')]).then(([compile, warnings]) => ({
    compileStyleCss: compile.compileStyleCss,
    compileStylesheets: compile.compileStylesheets,
    styleWarnings: warnings.styleWarnings,
  }));
  return pending;
}
