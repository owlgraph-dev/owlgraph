// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { createRawSnippet, getAllContexts, mount, tick, unmount, type Component } from 'svelte';
import FieldRow from '../FieldRow.svelte';
import Input from '../Input.svelte';
import Select from '../Select.svelte';
import Textarea from '../Textarea.svelte';
import Toaster from '../Toaster.svelte';
import { toaster } from '../toast.svelte';
import FormFieldSpecimens from './sections/FormFieldSpecimens.svelte';
import FieldRowSpecimens from './sections/FieldRowSpecimens.svelte';
import ToastSpecimens from './sections/ToastSpecimens.svelte';
import CommandSearchSpecimens from './sections/CommandSearchSpecimens.svelte';
import DialogSpecimens from './sections/DialogSpecimens.svelte';

// Each renders the playground's own specimens alone; what only the whole page
// shows stays with the e2e lane (../e2e/playground.spec.ts).

const specimen = (state: string) => screen.elementLocator(document.querySelector(`[data-specimen="${state}"]`)!);
const openLayers = () => document.querySelectorAll('[data-state="open"], [data-state="delayed-open"], [data-state="instant-open"]').length;
const described = (el: Element) => (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);

afterEach(() => {
  vi.useRealTimers();
  for (const item of [...toaster.items]) toaster.dismiss(item.id);
  toaster.resume();
});

describe('a form field', () => {
  it('reaches its control with its label, puts its hint and error in the control’s aria-describedby, sets aria-invalid only with an error, and names a group', async () => {
    const view = render(FormFieldSpecimens);
    const fields = [...view.container.querySelectorAll<HTMLElement>('.ds-form-field')];
    expect(fields.length, 'the form-field specimens').toBeGreaterThanOrEqual(8);
    const problems: string[] = [];
    for (const f of fields) {
      const where = f.closest('[data-specimen]')?.getAttribute('data-specimen') ?? '?';
      const hint = f.querySelector(':scope > .ds-form-field-hint');
      const error = f.querySelector(':scope > .ds-field-error');
      if (f.getAttribute('role') === 'group') {
        if (!document.getElementById(f.getAttribute('aria-labelledby') ?? '')?.textContent?.trim()) problems.push(`${where}: group has no name`);
        continue;
      }
      const label = f.querySelector(':scope > label');
      const control = document.getElementById(label?.getAttribute('for') ?? '');
      if (!control) {
        problems.push(`${where}: label[for] reaches no control`);
        continue;
      }
      if (hint && !described(control).includes(hint.id)) problems.push(`${where}: hint is not in the control's aria-describedby`);
      if (error && !described(control).includes(error.id)) problems.push(`${where}: error is not in the control's aria-describedby`);
      const invalid = control.getAttribute('aria-invalid') === 'true';
      if (!!error !== invalid) problems.push(`${where}: aria-invalid is ${invalid} but the field ${error ? 'shows' : 'has no'} error`);
    }
    expect(problems).toEqual([]);

    // As assistive technology reads them.
    await expect.element(specimen('hint').getByRole('textbox', { name: 'Description (optional)' })).toHaveAccessibleDescription('One sentence; shown as a tooltip in the catalog.');
    await expect.element(specimen('error').getByRole('textbox', { name: 'Key' })).toHaveAccessibleDescription('This key is already taken in the namespace.');
    await expect.element(specimen('error').getByRole('textbox', { name: 'Key' })).toHaveAttribute('aria-invalid', 'true');
    await expect.element(specimen('required').getByRole('textbox', { name: 'Key' })).not.toHaveAttribute('aria-invalid');
    await expect.element(screen.getByRole('group', { name: 'Links to' })).toBeVisible();
  });
});

// A control mounted inside the row with the row's context, as a consumer's markup would.
function control(component: Component<Record<string, unknown>>, props: Record<string, unknown>) {
  return createRawSnippet(() => {
    let context = new Map<unknown, unknown>();
    return {
      render: () => {
        context = getAllContexts();
        return '<div class="control-host"></div>';
      },
      setup: (target: Element) => {
        const instance = mount(component, { target, props, context });
        return () => unmount(instance);
      },
    };
  });
}

describe('a field row', () => {
  it('puts its error in its control’s aria-describedby and sets the control aria-invalid', async () => {
    // The playground's rows, and one each around an input, a select and a textarea.
    render(FieldRowSpecimens);
    render(FieldRow, { label: 'Target', layout: 'stack', error: 'Enter a full URL.', children: control(Input as Component<Record<string, unknown>>, { size: 'sm', value: 'example' }) });
    render(FieldRow, { label: 'Align', error: 'Pick one of the three.', children: control(Select as Component<Record<string, unknown>>, { items: [{ value: 'start', label: 'Start' }], value: 'start', size: 'sm' }) });
    render(FieldRow, { label: 'Notes', layout: 'stack', error: 'At most 200 characters.', children: control(Textarea as Component<Record<string, unknown>>, { value: 'x'.repeat(201) }) });
    await tick();

    const rows = [...document.querySelectorAll<HTMLElement>('.ds-field-row')].filter((r) => r.querySelector(':scope > .ds-field-row-error > .ds-field-error'));
    expect(rows.length, 'rows with an error').toBeGreaterThanOrEqual(5);
    const kinds = new Set<string>();
    const problems: string[] = [];
    for (const r of rows) {
      const where = r.closest('[data-specimen]')?.getAttribute('data-specimen') ?? r.querySelector('.ds-field-label')?.textContent ?? '?';
      const error = r.querySelector(':scope > .ds-field-row-error > .ds-field-error')!;
      const controls = [...r.querySelectorAll('.ds-field-control input, .ds-field-control [role="combobox"], .ds-field-control textarea')];
      if (controls.length === 0) problems.push(`${where}: no control`);
      for (const c of controls) {
        kinds.add(c.getAttribute('role') ?? c.tagName.toLowerCase());
        if (!described(c).includes(error.id)) problems.push(`${where}: error is not in the control's aria-describedby`);
        if (c.getAttribute('aria-invalid') !== 'true') problems.push(`${where}: control is not aria-invalid`);
      }
    }
    expect(problems).toEqual([]);
    expect([...kinds].sort()).toEqual(['combobox', 'input', 'textarea']);
    await expect.element(screen.getByRole('textbox', { name: 'Target' })).toHaveAccessibleDescription(/Enter a full URL, e\.g\. https:\/\/example\.com\./);
  });
});

describe('the toasts', () => {
  it('are announced in the assertive or polite live region with no alert role, run an action and close, close the newest on Escape, do not stack the same message, hold a fourth back, and pause every timer on hover', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    render(ToastSpecimens);
    render(Toaster, { regionLabel: 'Notifications', closeLabel: 'Dismiss' });
    const region = screen.getByRole('region', { name: 'Notifications' });
    const toasts = () => document.querySelectorAll('.ds-toaster .ds-toast').length;
    const show = (state: string) => specimen(state).getByRole('button').click();
    const live = (politeness: 'polite' | 'assertive') => document.querySelector(`.ds-toaster-live[aria-live="${politeness}"]`)?.textContent ?? '';

    await show('danger');
    expect(toasts()).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(live('assertive')).toMatch(/could not be saved/);
    // The live regions carry no role: a page's own alert stays the one found.
    expect(screen.getByRole('alert').elements()).toHaveLength(0);

    // An error has no timer.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(toasts()).toBe(1);
    await region.getByRole('button', { name: 'Try again' }).click();
    expect(specimen('danger').element().textContent).toContain('retried 1×');
    expect(toasts()).toBe(0);

    await show('danger');
    (region.getByRole('button', { name: 'Dismiss' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Escape}');
    await tick();
    expect(toasts()).toBe(0);

    await show('dedupe');
    await show('dedupe');
    expect(toasts()).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(live('polite')).toBe('Same message.');
    await show('queue');
    expect(toasts()).toBe(3);
    const shown = () => [...document.querySelectorAll('.ds-toaster .ds-toast-message')].map((p) => p.textContent);
    expect(shown()).toEqual(['Same message.', 'Queued message 1 of 5.', 'Queued message 2 of 5.']);

    // Hovered, the same three outlast their 5s; left, the queued ones take their turn.
    await screen.elementLocator(document.querySelector('.ds-toaster .ds-toast')!).hover();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(shown()).toEqual(['Same message.', 'Queued message 1 of 5.', 'Queued message 2 of 5.']);
    await specimen('danger').getByRole('button').hover();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(shown()).toEqual(['Queued message 3 of 5.', 'Queued message 4 of 5.', 'Queued message 5 of 5.']);
    for (let i = 0; i < 20 && toasts() > 0; i++) await vi.advanceTimersByTimeAsync(1_000);
    expect(toasts()).toBe(0);
  });
});

describe('a command search', () => {
  it('names the list it controls and the option the arrows reach, skips a disabled row, clears and keeps focus, and in a popover clears a typed term before Escape closes the layer', async () => {
    render(CommandSearchSpecimens);
    const cell = specimen('list');
    const field = cell.getByRole('combobox');
    const list = cell.getByRole('listbox', { name: 'Matches' });
    await expect.element(field).toHaveAttribute('aria-controls', list.element().id);
    const highlighted = () => {
      const id = field.element().getAttribute('aria-activedescendant');
      return id ? (document.getElementById(id)?.textContent ?? '').trim() : null;
    };

    await field.click();
    await expect.poll(highlighted).toMatch(/^Getting started/);
    await userEvent.keyboard('{ArrowDown}');
    await expect.poll(highlighted).toMatch(/^Release notes/);
    await expect.element(cell.getByRole('option', { name: /^Archive/ })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{ArrowDown}');
    await expect.poll(highlighted).toMatch(/^Roadmap/);

    await field.fill('road');
    await expect.poll(() => cell.getByRole('option').elements().length).toBe(1);
    await cell.getByRole('button', { name: 'Clear search' }).click();
    await expect.element(field).toHaveValue('');
    await expect.element(field).toHaveFocus();
    await expect.element(cell.getByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    const before = openLayers();
    await specimen('in-popover').getByRole('button', { name: 'Find' }).click();
    const inner = screen.elementLocator(document.querySelector('[data-popover-content] [role="combobox"]')!);
    await expect.element(inner).toHaveFocus();
    await userEvent.keyboard('road');
    await expect.element(inner).toHaveValue('road');
    await userEvent.keyboard('{Escape}');
    await expect.element(inner).toHaveValue('');
    await expect.element(inner).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.poll(openLayers).toBe(before);
  });
});

describe('a bottom sheet’s page', () => {
  it('replaces the content, and Back or Escape returns to the content as it was with focus on the button that opened it, while a pick there closes it', async () => {
    render(DialogSpecimens);
    await screen.getByRole('button', { name: 'Open sheet with a page' }).click();
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('textbox', { name: 'Name' }).fill('Kept');
    const choose = settings.getByRole('button', { name: 'Choose a colour…' });
    await choose.click();
    const sheet = screen.getByRole('dialog', { name: 'Pick a colour' });
    await expect.element(sheet).toBeVisible();
    await expect.element(sheet.getByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await expect.element(settings).toBeVisible();
    await expect.element(settings.getByRole('textbox', { name: 'Name' })).toHaveValue('Kept');
    await expect.element(choose).toHaveFocus();

    await choose.click();
    await sheet.getByRole('button', { name: 'Green' }).click();
    await expect.element(settings).toHaveTextContent('Colour: Green');
    await choose.click();
    await sheet.getByRole('button', { name: 'Back', exact: true }).click();
    await expect.element(settings).toHaveTextContent('Colour: Green');
    await expect.element(choose).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  });
});
