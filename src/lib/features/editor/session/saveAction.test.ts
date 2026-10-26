// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as m from '$lib/paraglide/messages';
import type { EditorCore } from '../core/editorCore.svelte';
import { SaveAction } from './saveAction.svelte';

const toasts = vi.hoisted(() => ({ error: vi.fn((..._args: unknown[]) => 7), dismiss: vi.fn() }));
vi.mock('$lib/design-system', () => ({ toast: toasts }));

const DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/** The core as the Save button reads it: what the editor holds, what it last stored. */
function fakeCore(removed: string[] = []) {
  const saved: unknown[] = [];
  const core = { editor: {}, docJSON: () => DOC, removedUnknown: () => removed, markSaved: (json: unknown) => saved.push(json) };
  return { core: core as unknown as EditorCore, saved };
}

beforeEach(() => {
  toasts.error.mockClear();
  toasts.dismiss.mockClear();
});

describe('the Save button', () => {
  it('stores what the editor holds, with the unknown blocks it may drop, and says when', async () => {
    const { core, saved } = fakeCore(['u-1']);
    const onSave = vi.fn(async () => ({ ok: true }));
    const save = new SaveAction(core, onSave);

    const run = save.run();
    expect(save.saving).toBe(true);
    await run;
    expect(onSave).toHaveBeenCalledWith(DOC, { acknowledgeDropped: ['u-1'] });
    expect(saved).toEqual([DOC]);
    expect(save.saving).toBe(false);
    expect(save.savedAt).toEqual(expect.any(String));
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('keeps a failed save’s toast until dismissed, whose retry saves again and clears it', async () => {
    const { core, saved } = fakeCore();
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const save = new SaveAction(core, onSave);

    await save.run();
    expect(saved).toEqual([]);
    expect(save.savedAt).toBeNull();
    expect(toasts.error).toHaveBeenCalledWith(m.editor_save_failed(), { action: { label: m.editor_save_retry(), onClick: save.run } });

    const [, options] = toasts.error.mock.calls[0] as [string, { action: { onClick: () => Promise<void> } }];
    await options.action.onClick();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(saved).toEqual([DOC]);
    expect(toasts.dismiss).toHaveBeenCalledWith(7);
  });

  it('offers no retry when the page holds blocks the save would remove', async () => {
    const { core, saved } = fakeCore();
    const save = new SaveAction(core, async () => ({ ok: false, unknownDropped: true }));
    await save.run();
    expect(saved).toEqual([]);
    expect(toasts.error).toHaveBeenCalledWith(m.editor_save_unknown_dropped());
  });

  it('leaves a lost lock to the banner', async () => {
    const { core, saved } = fakeCore();
    const save = new SaveAction(core, async () => ({ ok: false, lockLost: true }));
    await save.run();
    expect(saved).toEqual([]);
    expect(save.saving).toBe(false);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('does nothing before the editor exists', async () => {
    const { core } = fakeCore();
    (core as unknown as { editor: unknown }).editor = undefined;
    const onSave = vi.fn();
    await new SaveAction(core, onSave).run();
    expect(onSave).not.toHaveBeenCalled();
  });
});
