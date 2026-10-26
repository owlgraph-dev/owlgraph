<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The trigger's chevron is Lucide's chevron-down (ISC; THIRD-PARTY-NOTICES.md).
  // bits-ui's Root takes the flat item list (it resolves the trigger's label and
  // typeahead); `groups` only shape the rendered list.
  import { Select as BitsSelect } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { getFormFieldContext } from './formField';
  import Icon from './Icon.svelte';

  interface SelectItem {
    value: string;
    label: string;
    /** Shown but not choosable. */
    disabled?: boolean;
  }
  interface SelectGroup {
    label: string;
    items: SelectItem[];
  }

  let {
    items = [],
    groups,
    value = $bindable(''),
    onValueChange,
    placeholder = '',
    disabled = false,
    ariaLabel,
    id,
    invalid = false,
    width = 'auto',
    size = 'md',
    name,
    leading,
    trailing,
    class: className = '',
  }: {
    items?: SelectItem[];
    /** Labelled sections; when given, `items` is ignored. */
    groups?: SelectGroup[];
    value?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    /** The trigger's id (a FormField supplies it). */
    id?: string;
    /** Error state (a FormField with an error sets it). */
    invalid?: boolean;
    /** `full` stretches the trigger to its container and ellipsizes the value. */
    width?: 'auto' | 'full';
    /** `sm` is the compact trigger for a narrow panel row. */
    size?: 'sm' | 'md';
    /** Posts the value under this name (Bits UI renders a hidden input). */
    name?: string;
    /** Decoration before an option's label and the trigger's; the label stays the name. */
    leading?: Snippet<[value: string]>;
    /** A short state after an option's label, in the list only; part of its accessible text. */
    trailing?: Snippet<[value: string]>;
    class?: string;
  } = $props();

  const flatItems = $derived(groups ? groups.flatMap((g) => g.items) : items);
  // The combobox role requires aria-controls → the listbox; bits-ui fills
  // neither, so the two ends are tied here.
  const uid = $props.id();
  const listId = `${uid}-list`;
  const field = getFormFieldContext();
  const isInvalid = $derived(invalid || !!field?.invalid);
  const selectedLabel = $derived(flatItems.find((i) => i.value === value)?.label);
</script>

{#snippet option(item: SelectItem)}
  <BitsSelect.Item value={item.value} label={item.label} disabled={item.disabled}>
    {#snippet child({ props, selected }: { props: Record<string, unknown>; selected: boolean })}
      <div {...props} class="ds-select-item">
        <span class="ds-select-check" aria-hidden="true">{#if selected}<Icon name="check" size={14} />{/if}</span>{#if leading}<span class="ds-select-leading" aria-hidden="true">{@render leading(item.value)}</span>{/if}
        {item.label}{#if trailing}<span class="ds-select-trailing">{@render trailing(item.value)}</span>{/if}
      </div>
    {/snippet}
  </BitsSelect.Item>
{/snippet}

<!-- Every Bits UI part renders through its `child` snippet, so the styles are
     scoped (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). -->
<BitsSelect.Root type="single" bind:value {onValueChange} {disabled} {name} items={flatItems.map((i) => ({ value: i.value, label: i.label }))}>
  <!-- role="combobox": bits-ui gives the <button> aria-activedescendant,
       aria-haspopup and aria-expanded, which only that role permits. -->
  <BitsSelect.Trigger aria-label={ariaLabel} role="combobox" aria-controls={listId} id={id ?? field?.controlId} aria-describedby={field?.describedBy} aria-invalid={isInvalid ? 'true' : undefined}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      <button {...props} class="ds-select-trigger {className}" class:ds-select-trigger--full={width === 'full'} class:ds-select-trigger--sm={size === 'sm'}>
        {#if leading && selectedLabel}<span class="ds-select-leading" aria-hidden="true">{@render leading(value)}</span>{/if}<span class="ds-select-value" class:ds-select-value--placeholder={!selectedLabel}>{selectedLabel ?? placeholder}</span>
        <svg class="ds-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    {/snippet}
  </BitsSelect.Trigger>
  <BitsSelect.Portal>
    <!-- The listbox's own name: the trigger's label, or the placeholder. -->
    <BitsSelect.Content id={listId} aria-label={ariaLabel || (field ? undefined : placeholder) || undefined} aria-labelledby={!ariaLabel && field ? field.labelId : undefined}>
      {#snippet child({ props, wrapperProps }: { props: Record<string, unknown>; wrapperProps: Record<string, unknown> })}
        <div {...wrapperProps}>
          <div {...props} class="ds-select-content">
            <BitsSelect.Viewport>
              {#if groups}
                {#each groups as group (group.label)}
                  {#if group.items.length > 0}
                    <BitsSelect.Group>
                      {#snippet child({ props: groupProps }: { props: Record<string, unknown> })}
                        <div {...groupProps} class="ds-select-group">
                          <BitsSelect.GroupHeading>
                            {#snippet child({ props: headingProps }: { props: Record<string, unknown> })}
                              <div {...headingProps} class="ds-select-group-heading">{group.label}</div>
                            {/snippet}
                          </BitsSelect.GroupHeading>
                          {#each group.items as item (item.value)}
                            {@render option(item)}
                          {/each}
                        </div>
                      {/snippet}
                    </BitsSelect.Group>
                  {/if}
                {/each}
              {:else}
                {#each items as item (item.value)}
                  {@render option(item)}
                {/each}
              {/if}
            </BitsSelect.Viewport>
          </div>
        </div>
      {/snippet}
    </BitsSelect.Content>
  </BitsSelect.Portal>
</BitsSelect.Root>

<style>
  .ds-select-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    height: var(--ds-control-h-md);
    padding: 0 0.6rem;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-field-md);
    color: var(--ds-color-fg);
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    cursor: pointer;
  }
  .ds-select-trigger:not(:disabled):not([aria-invalid='true']):hover { border-color: var(--ds-color-border-hover); }
  .ds-select-trigger:not(:disabled):active { background: var(--ds-color-fill-hover); }
  .ds-select-trigger:not(:disabled):not([aria-invalid='true']):active { border-color: var(--ds-color-border-hover); }
  .ds-select-trigger[aria-invalid='true'] { border-color: var(--ds-color-danger); }
  .ds-select-trigger:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-select-trigger--full { width: 100%; min-width: 0; box-sizing: border-box; }
  .ds-select-trigger--sm { height: var(--ds-control-h-sm); padding: 0 0.45rem; font-size: var(--ds-text-field-sm); }
  .ds-select-value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .ds-select-value--placeholder { color: var(--ds-color-muted); }
  .ds-select-chevron { flex: none; color: var(--ds-color-muted); }

  .ds-select-content {
    /* Above a Dialog: a Select often opens inside one. */
    z-index: var(--ds-z-floating);
    min-width: var(--bits-select-anchor-width, 140px);
    max-height: 280px;
    overflow-y: auto;
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    padding: 0.3rem;
    font-family: var(--ds-font-sans);
  }
  .ds-select-item {
    display: flex;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    min-height: var(--ds-target-min);
    padding: 0.4rem 0.5rem;
    border-radius: var(--ds-radius-sm);
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
    cursor: pointer;
  }
  /* The selection is marked by its check and weight, not by the highlight. */
  .ds-select-item[data-highlighted] { background: var(--ds-color-fill-hover); }
  .ds-select-item[data-highlighted]:active { background: var(--ds-color-fill-pressed); }
  .ds-select-item[data-selected] { font-weight: var(--ds-weight-medium); }
  /* Muted, not dimmed: the label stays legible (4.5:1). */
  .ds-select-item[data-disabled] { color: var(--ds-color-muted); cursor: default; }
  .ds-select-check {
    display: inline-flex;
    flex: none;
    width: 1em;
    margin-right: 0.3rem;
    color: var(--ds-color-accent);
  }
  .ds-select-leading { display: inline-flex; flex: none; align-items: center; margin-right: 0.4rem; }
  .ds-select-trigger .ds-select-leading { margin-right: 0; }
  .ds-select-trailing { display: inline-flex; flex: none; align-items: center; margin-left: auto; padding-left: var(--ds-space-sm); }
  .ds-select-group + .ds-select-group { margin-top: 0.3rem; padding-top: 0.3rem; border-top: 1px solid var(--ds-color-border); }
  .ds-select-group-heading {
    padding: 0.3rem 0.5rem 0.15rem;
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-medium);
    color: var(--ds-color-muted);
  }
</style>
