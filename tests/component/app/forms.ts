// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// `$app/forms` for component tests: `use:enhance` leaves the submit to the browser.
export const enhance = (_form: HTMLFormElement, _submit?: unknown) => ({ destroy: () => {} });
export const applyAction = async (_result: unknown): Promise<void> => {};
export const deserialize = (text: string): unknown => JSON.parse(text);
