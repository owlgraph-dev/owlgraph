// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A FormField publishes its label's target id, hint and error ids and invalid
// state; its one control wires itself from them. Props passed to the control
// win; a group field publishes no id; a control composing another (ChipInput)
// clears the context for its children.
import { getContext, setContext } from 'svelte';

const KEY = Symbol('ds-form-field');

export interface FormFieldContext {
  /** The id the field's label points at; undefined for a group field. */
  readonly controlId: string | undefined;
  /** For a part that needs naming on its own (a Select's listbox). */
  readonly labelId: string;
  /** Space-separated ids of the field's hint and error text, if any. */
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

export function setFormFieldContext(context: FormFieldContext | null): void {
  setContext(KEY, context);
}

export function getFormFieldContext(): FormFieldContext | null {
  return getContext<FormFieldContext | null | undefined>(KEY) ?? null;
}
