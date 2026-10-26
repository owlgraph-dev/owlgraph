<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // An integration's settings (docs/architecture/settings.md, "The integrations group"): the
  // fields its plugin declares, drawn by kind and checked by the core. "Check
  // connection" probes the address as typed, before anything is saved.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Alert, Button, Checkbox, Dialog, FieldError, Input, SettingsRow, toast } from '$lib/design-system';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import type { SettingsFieldProblem, SettingsFieldView } from '$lib/features/pluginHost';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();

  let enabled = $state(untrack(() => data.enabled));
  let values = $state<Record<string, string>>(untrack(() => Object.fromEntries(data.fields.map((f) => [f.key, f.value]))));
  let busy = $state<'save' | 'check' | null>(null);
  let confirming = $state(false);
  let clearing = $state(false);
  const clearFormId = 'integration-disconnect-all';

  const problems = $derived<Readonly<Record<string, SettingsFieldProblem | undefined>>>(form?.problems ?? {});
  const messages = $derived<Readonly<Record<string, string | undefined>>>(form?.messages ?? {});
  const checked = $derived(form?.checked ?? null);

  function problemText(problem: SettingsFieldProblem, field?: SettingsFieldView): string {
    switch (problem) {
      case 'required':
        return m.settings_integration_problem_required();
      case 'origin-invalid':
        return m.settings_integration_problem_origin_invalid();
      case 'origin-insecure':
        return m.settings_integration_problem_origin_insecure();
      case 'not-a-number':
        return m.settings_integration_problem_not_a_number();
      case 'out-of-range':
        return m.settings_integration_problem_out_of_range({ min: String(field?.min ?? ''), max: String(field?.max ?? '') });
      case 'no-secret-key':
        return m.settings_integration_problem_no_secret_key();
    }
  }

  const errorOf = (key: string, field?: SettingsFieldView): string | null => {
    const problem = problems[key];
    return problem ? problemText(problem, field) : (messages[key] ?? null);
  };
</script>

<SettingsPageHead title={data.plugin.label} intro={data.plugin.intro} />

<form
  method="POST"
  action="?/save"
  use:enhance={({ action }) => {
    busy = action.search.includes('check') ? 'check' : 'save';
    return async ({ result, update }) => {
      await update({ reset: false });
      busy = null;
      if (action.search.includes('check')) return;
      if (result.type === 'success') {
        // What the server stored — an address normalized, a number parsed.
        enabled = data.enabled;
        values = Object.fromEntries(data.fields.map((f) => [f.key, f.value]));
        toast.success(m.settings_integration_saved());
        const dropped = Number((result.data as { dropped?: number } | undefined)?.dropped ?? 0);
        if (dropped > 0) toast.info(m.settings_integration_connections_dropped({ count: dropped }));
      } else if (result.type !== 'failure') {
        toast.error(m.settings_integration_save_failed());
      }
    };
  }}
>
  <div class="rows">
    <SettingsRow label={m.settings_integration_enabled_label()} description={m.settings_integration_enabled_desc()}>
      <div class="control">
        <Checkbox name="enabled" bind:checked={enabled}>{m.settings_integration_enabled_checkbox()}</Checkbox>
        {#if errorOf('enabled')}<FieldError id="integration-enabled-error" message={errorOf('enabled') ?? ''} />{/if}
      </div>
    </SettingsRow>
    {#each data.fields as field (field.key)}
      {@const error = errorOf(field.key, field)}
      <SettingsRow label={field.label} description={field.description ?? undefined} for="integration-{field.key}">
        <div class="control">
          <div class="input-line">
            <Input
              id="integration-{field.key}"
              name={field.key}
              type={field.kind === 'number' ? 'number' : 'url'}
              bind:value={values[field.key]}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              placeholder={field.kind === 'origin' ? 'https://' : undefined}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `integration-${field.key}-error` : undefined}
              class={field.kind === 'number' ? 'narrow' : 'wide'}
            />
            {#if field.unit}<span class="unit">{field.unit}</span>{/if}
          </div>
          {#if error}<FieldError id="integration-{field.key}-error" message={error} />{/if}
        </div>
      </SettingsRow>
    {/each}
  </div>

  {#if checked}
    <div class="outcome"><Alert tone={checked.ok ? 'success' : 'danger'}>{checked.message}</Alert></div>
  {/if}

  <div class="actions">
    {#if data.canCheck}
      <Button type="submit" formaction="?/check" loading={busy === 'check'} disabled={busy !== null && busy !== 'check'}>{m.settings_integration_check()}</Button>
    {/if}
    <Button type="submit" variant="primary" loading={busy === 'save'} disabled={busy !== null && busy !== 'save'}>{m.settings_integration_save()}</Button>
  </div>
</form>

{#if data.connections}
  <div class="rows connections">
    <SettingsRow label={m.settings_integration_connections_label()} description={m.settings_integration_connections_desc()}>
      <div class="control">
        <p class="count">{m.settings_integration_connections_count({ count: data.connections.active })}</p>
        <div>
          <Button variant="ghost-danger" disabled={data.connections.total === 0} onclick={() => (confirming = true)}>{m.settings_integration_disconnect_all()}</Button>
        </div>
      </div>
    </SettingsRow>
  </div>

  <Dialog
    open={confirming}
    onOpenChange={(o) => {
      if (!o) confirming = false;
    }}
    size="sm"
    variant="danger"
    title={m.settings_integration_disconnect_all_title()}
    description={data.enabled ? m.settings_integration_disconnect_all_body() : m.settings_integration_disconnect_all_body_off()}
  >
    <form
      id={clearFormId}
      method="POST"
      action="?/disconnectAll"
      use:enhance={() => {
        clearing = true;
        return async ({ result, update }) => {
          await update({ reset: false });
          clearing = false;
          confirming = false;
          if (result.type === 'success') {
            const { cleared = 0, notAsked = 0 } = (result.data as { cleared?: number; notAsked?: number } | undefined) ?? {};
            // Removed here is not forgotten there: said so, never as a plain success.
            if (notAsked > 0) toast.warning(m.settings_integration_disconnected_unasked({ count: cleared, unasked: notAsked }));
            else toast.success(m.settings_integration_disconnected_all({ count: cleared }));
          } else toast.error(m.settings_integration_save_failed());
        };
      }}
    ></form>
    {#snippet footer()}
      <Button type="button" onclick={() => (confirming = false)}>{m.settings_cancel()}</Button>
      <Button type="submit" form={clearFormId} variant="danger" loading={clearing}>{m.settings_integration_disconnect_all()}</Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .rows { border-top: 1px solid var(--ds-color-border); }
  .connections { margin-top: var(--ds-space-lg); }
  .count { margin: 0; font-size: var(--ds-text-md); color: var(--ds-color-fg); }
  .control { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  .input-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-sm); }
  .input-line :global(.wide) { width: min(26rem, 100%); }
  .input-line :global(.narrow) { width: 8rem; }
  .unit { color: var(--ds-color-muted); font-size: var(--ds-text-xs); }
  .outcome { margin-top: var(--ds-space-md); }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--ds-space-sm); padding-top: var(--ds-space-md); }
</style>
