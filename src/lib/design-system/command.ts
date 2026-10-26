// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Command publishes its listbox's id for CommandSearch's aria-controls: Bits UI
// fills it only from its Viewport, inside the listbox.
import { getContext, setContext } from 'svelte';

const KEY = Symbol('ds-command');

export interface CommandContext {
  readonly listId: string;
  /** Reactive: an aria-controls naming a missing id is an error. */
  listed: boolean;
}

export function setCommandContext(context: CommandContext): void {
  setContext(KEY, context);
}

export function getCommandContext(): CommandContext | null {
  return getContext<CommandContext | undefined>(KEY) ?? null;
}
