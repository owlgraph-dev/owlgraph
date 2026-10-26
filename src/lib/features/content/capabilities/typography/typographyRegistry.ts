// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Browser-only: the custom fonts and resolved paragraph styles for code that
// runs inside Tiptap's renderHTML, which takes no parameters. A tab has one
// editor, so a module singleton is safe here; SSR passes the registry to
// renderDoc instead, since concurrent requests would race on a global.
import { customFontStacksRecord, type CustomFontEntry } from './fonts';
import type { TypographyRegistry } from './roles';
import type { ResolvedParagraphStyle } from './paragraphStyles';

let customFonts: readonly CustomFontEntry[] = [];
let paragraphStyles: readonly ResolvedParagraphStyle[] = [];

export function setTypographyRegistry(nextCustomFonts: readonly CustomFontEntry[], nextParagraphStyles: readonly ResolvedParagraphStyle[]): void {
  customFonts = nextCustomFonts;
  paragraphStyles = nextParagraphStyles;
}

export function getTypographyRegistry(): TypographyRegistry {
  return { customStacks: customFontStacksRecord(customFonts), paragraphStyles };
}

export function getCustomFontLabels(): { id: string; label: string }[] {
  return customFonts.map((e) => ({ id: e.id, label: e.name }));
}
