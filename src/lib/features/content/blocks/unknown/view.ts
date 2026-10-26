// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Only the editor draws an unknown block, so its words are the interface's
// (docs/architecture/blocks/anatomy.md, "Unknown blocks"). A retired plugin's kind goes by its label.
import * as m from '$lib/paraglide/messages';
import { localize } from '$lib/platform/i18n/localizedText';
import { retiredBlockKind } from '$lib/plugins';
import { NO_OVERRIDES } from '../../capabilities/overrides';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { UnknownBlockAttrs } from '../../doc/unknownBlocks';

/** Its id only: it takes no capability. */
export function unknownWrapper(attrs: Readonly<Record<string, unknown>> | undefined): BlockWrapper {
  const a = (attrs ?? {}) as Partial<UnknownBlockAttrs>;
  return { classes: ['unknown-block'], blockId: a.blockId ?? null, overrides: NO_OVERRIDES };
}

export interface UnknownBlockProps extends Record<string, unknown> {
  title: string;
  /** That it is kept, and shows nowhere. */
  note: string;
}

export function unknownBlockProps(attrs: Readonly<Record<string, unknown>> | undefined): UnknownBlockProps {
  const a = (attrs ?? {}) as Partial<UnknownBlockAttrs>;
  const type = String(a.originalType ?? '');
  const retired = retiredBlockKind(type);
  return {
    title: retired ? m.unknown_block_plugin({ label: localize(retired.label, type) }) : m.unknown_block_type({ type }),
    note: m.unknown_block_note(),
  };
}
